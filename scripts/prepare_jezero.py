#!/usr/bin/env python3
"""Reproduce the SCI-01 1 km Jezero subset using bounded COG HTTP Range reads.
Run in an isolated environment with requirements-sci01.txt. Never downloads a whole COG.
"""
import hashlib, json, math, ssl, threading, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import certifi
import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.windows import from_bounds, Window
from rasterio.warp import reproject, transform_bounds, Resampling
from pyproj import CRS, Transformer, Geod
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/data/terrain/jezero-hirise-1km'
ITEM_ID = 'DTEEC_045994_1985_046060_1985_U01'
ITEM_URL = 'https://stac.astrogeology.usgs.gov/api/collections/mro_hirise_socet_dtms/items/' + ITEM_ID
DOC_URL = 'https://stac.astrogeology.usgs.gov/docs/data/mars/hirise_dtms/'
PDS_URL = 'https://hirise.lpl.arizona.edu/dtm/dtm.php?ID=ESP_045994_1985'
CTX = ssl.create_default_context(cafile=certifi.where())
MAX_BYTES = 200_000_000  # entire remote payload budget, stricter than user's 250 MB gate
ledger = []
lock = threading.Lock()

def small_get(url):
    with urllib.request.urlopen(url, context=CTX, timeout=45) as response:
        payload = response.read(2_000_001)
        if len(payload) > 2_000_000: raise RuntimeError('Unexpectedly large metadata')
        ledger.append({'url': url, 'bytes': len(payload), 'kind': 'metadata'})
        return payload

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # Read only the attached PDS text label, never the full IMG (>250 MB).
    label_url = 'https://hirise.lpl.arizona.edu/PDS/DTM/ESP/ORB_045900_045999/ESP_045994_1985_ESP_046060_1985/' + ITEM_ID + '.IMG'
    request = urllib.request.Request(label_url, headers={'Range': 'bytes=0-32767'})
    with urllib.request.urlopen(request, context=CTX, timeout=45) as response:
        if response.status != 206: raise RuntimeError('PDS server must honor bounded Range')
        payload = response.read(32769)
        if len(payload) > 32768: raise RuntimeError('PDS label range exceeded')
    label = payload.decode('ascii', errors='replace').replace('\r\n', '\n').split('\nEND\n', 1)[0] + '\nEND\n'
    if 'MARS2000' not in ''.join(label.upper().split()): raise RuntimeError('Expected vertical datum evidence missing')
    (OUT/'source-pds-label.txt').write_text(label)
    ledger.append({'url': label_url, 'bytes': len(payload), 'kind': 'PDS label range', 'status': 206})
    item_payload = small_get(ITEM_URL)
    item = json.loads(item_payload)
    (OUT / 'source-stac-item.json').write_bytes(item_payload)
    provenance = small_get(item['assets']['provenance']['href'])
    (OUT / 'source-processing.txt').write_bytes(provenance)
    assets = {name + '.tif': item['assets'][name]['href'] for name in ['dtm', 'ortho_2']}

    class RangeProxy(BaseHTTPRequestHandler):
        def log_message(self, *_): pass
        def do_HEAD(self): self.forward(head=True)
        def do_GET(self): self.forward(head=False)
        def forward(self, head):
            name = self.path.lstrip('/')
            if name not in assets: self.send_error(404); return
            headers = {}
            if not head:
                requested = self.headers.get('Range')
                if not requested or not requested.startswith('bytes=') or ',' in requested:
                    self.send_error(400, 'Only bounded byte ranges are permitted'); return
                first, last = map(int, requested[6:].split('-'))
                if last - first + 1 > 16_000_000: self.send_error(413); return
                headers['Range'] = requested
            try:
                request = urllib.request.Request(assets[name], headers=headers, method='HEAD' if head else 'GET')
                with urllib.request.urlopen(request, context=CTX, timeout=60) as remote:
                    if not head and remote.status != 206: raise RuntimeError('Server ignored HTTP Range; refusing full asset')
                    data = b'' if head else remote.read(last - first + 2)
                    if not head and len(data) > last - first + 1: raise RuntimeError('Oversized range response')
                    with lock:
                        if sum(entry['bytes'] for entry in ledger) + len(data) > MAX_BYTES: raise RuntimeError('200 MB cumulative payload limit reached')
                        ledger.append({'url': assets[name], 'bytes': len(data), 'range': headers.get('Range'), 'contentRange': remote.headers.get('Content-Range'), 'assetBytes': remote.headers.get('Content-Length') if head else None, 'status': remote.status})
                    self.send_response(remote.status)
                    for key in ['Content-Type', 'Content-Length', 'Accept-Ranges', 'Content-Range']:
                        if remote.headers.get(key): self.send_header(key, remote.headers[key])
                    self.end_headers()
                    if not head: self.wfile.write(data)
            except Exception as error:
                print('Range error:', error, flush=True)
                self.send_error(502, str(error))

    server = ThreadingHTTPServer(('127.0.0.1', 0), RangeProxy)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    local_crs = CRS.from_proj4('+proj=eqc +lat_ts=18.44 +lat_0=18.44 +lon_0=77.45 +R=3396190 +units=m +no_defs +type=crs')
    dst_transform = from_origin(-500, 500, 2, 2)
    report = {'item': ITEM_ID, 'centerLonLat': [77.45, 18.44], 'width': 500, 'height': 500, 'targetCrsWkt': local_crs.to_wkt(), 'targetTransform': list(dst_transform.to_gdal()), 'resampling': 'nearest elevation; minimum validity over source footprint', 'checks': {}}

    def window_read(name):
        url = f'http://127.0.0.1:{server.server_port}/{name}.tif'
        with rasterio.open(url) as src:
            bounds = transform_bounds(local_crs, src.crs, -500, -500, 500, 500, densify_pts=21)
            window = from_bounds(*bounds, src.transform)
            left, top = math.floor(window.col_off)-2, math.floor(window.row_off)-2
            right, bottom = math.ceil(window.col_off+window.width)+2, math.ceil(window.row_off+window.height)+2
            window = Window(left, top, right-left, bottom-top).intersection(Window(0,0,src.width,src.height))
            raw = src.read(1, window=window)
            mask = src.read_masks(1, window=window) > 0
            info = {'url': assets[name+'.tif'], 'width': src.width, 'height': src.height, 'dtype': str(raw.dtype), 'scale': src.scales[0], 'offset': src.offsets[0], 'nodata': src.nodata, 'transform': list(src.transform.to_gdal()), 'crsWkt': src.crs.to_wkt(), 'window': [int(window.col_off),int(window.row_off),int(window.width),int(window.height)], 'tags': src.tags()}
            return raw, mask, src.window_transform(window), src.crs, info

    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', GDAL_HTTP_MAX_RETRY='1', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_CACHEMAX=64):
        raw, mask, source_transform, source_crs, info = window_read('dtm')
        # Rasterio.read returns raw samples: apply GDAL scale/offset exactly once.
        elevation = (raw.astype('float64') * info['scale'] + info['offset']).astype('float32')
        mask &= np.isfinite(elevation)
        elevation[~mask] = np.nan
        dst = np.full((500,500), np.nan, dtype='float32')
        validity = np.zeros((500,500), dtype='uint8')
        reproject(elevation, dst, src_transform=source_transform, src_crs=source_crs, dst_transform=dst_transform, dst_crs=local_crs, src_nodata=np.nan, dst_nodata=np.nan, resampling=Resampling.nearest)
        reproject(mask.astype('uint8'), validity, src_transform=source_transform, src_crs=source_crs, dst_transform=dst_transform, dst_crs=local_crs, dst_nodata=0, resampling=Resampling.min)
        validity &= np.isfinite(dst)
        dst[validity==0] = np.nan
        assert validity.mean() > .95, 'Selected patch insufficient valid coverage'
        report['source'] = info
        # Independent inverse-coordinate source pixel comparison at all target centers.
        rows, cols = np.indices(dst.shape)
        xx, yy = -499 + cols*2, 499 - rows*2
        src_x, src_y = Transformer.from_crs(local_crs, source_crs, always_xy=True).transform(xx,yy)
        inv = ~source_transform
        source_cols = np.floor(inv.a*src_x + inv.b*src_y + inv.c).astype(int)
        source_rows = np.floor(inv.d*src_x + inv.e*src_y + inv.f).astype(int)
        expected = elevation[source_rows, source_cols]
        error = float(np.max(np.abs(dst[validity==1] - expected[validity==1])))
        assert error == 0, f'Source elevations disagree by {error} m'
        report['checks']['allValidCellsMatchNearestScaledSourceExactly'] = True
        report['checks']['maxElevationDifferenceM'] = error
        report['controlSamples'] = [{'row':int(r),'col':int(c),'sourceRow':int(source_rows[r,c]+info['window'][1]),'sourceCol':int(source_cols[r,c]+info['window'][0]),'rawDN':float(raw[source_rows[r,c],source_cols[r,c]]),'elevationM':float(dst[r,c])} for r,c in [(0,0),(249,249),(499,499),(100,400)]]
        image_name = 'hillshade.png'
        image_description = 'Hillshade derived from the real HiRISE DTM; not a camera image. Sun azimuth315°, elevation45°.'
        try:
            photo, photo_mask, photo_transform, photo_crs, photo_info = window_read('ortho_2')
            img = np.zeros((500,500),dtype='float32')
            alpha = np.zeros((500,500),dtype='uint8')
            reproject(photo.astype('float32'),img,src_transform=photo_transform,src_crs=photo_crs,dst_transform=dst_transform,dst_crs=local_crs,resampling=Resampling.nearest)
            reproject(photo_mask.astype('uint8'),alpha,src_transform=photo_transform,src_crs=photo_crs,dst_transform=dst_transform,dst_crs=local_crs,resampling=Resampling.min,dst_nodata=0)
            alpha &= validity
            assert alpha.mean() > .95, 'Orthoimage insufficient coverage'
            low, high = np.percentile(img[alpha==1], [2,98])
            gray = np.clip((img-low)*255/(high-low),0,255).astype('uint8')
            Image.fromarray(np.dstack([gray,gray,gray,alpha*255])).save(OUT/'orthoimage.png')
            image_name = 'orthoimage.png'
            image_description = 'HiRISE ESP_045994_1985_RED_A_01_ORTHO, reprojected to the exact DEM grid, nearest-neighbor, grayscale 2–98 percentile display stretch. Not a hazard map.'
            report['orthoimage'] = {**photo_info,'displayPercentiles':[float(low),float(high)],'validPixels':int(alpha.sum()),'outputTransform':list(dst_transform.to_gdal())}
        except Exception as error:
            report['orthoimageUnavailable'] = str(error)

    # Diagnostic hillshade uses real elevation gradients and transparent NoData edges.
    gy, gx = np.gradient(dst.astype('float64'), 2)
    normal = np.dstack([-gx, gy, np.ones(dst.shape)])
    normal /= np.sqrt(np.sum(normal*normal,axis=2))[...,None]
    sun = np.array([-0.5,0.5,math.sqrt(.5)])
    lighting = np.nan_to_num(np.sum(normal*sun,axis=2),nan=0)
    gray = (np.clip(lighting,0,1)*220+25).astype('uint8')
    alpha = (np.isfinite(gx)&np.isfinite(gy)&(validity==1)).astype('uint8')*255
    Image.fromarray(np.dstack([gray,gray,gray,alpha])).save(OUT/'hillshade.png')
    dst.astype('<f4').tofile(OUT/'elevation.f32le')
    validity.tofile(OUT/'valid.u8')
    with rasterio.open(OUT/'terrain.tif','w',driver='GTiff',width=500,height=500,count=1,dtype='float32',crs=local_crs,transform=dst_transform,nodata=np.nan,compress='deflate') as target: target.write(dst,1)
    geo = Transformer.from_crs(local_crs, local_crs.geodetic_crs,always_xy=True)
    west,south = geo.transform(-500,-500)
    east,north = geo.transform(500,500)
    report['geographicBounds'] = [west,south,east,north]
    geod = Geod(a=3396190,b=3396190)
    lon1,lat1 = geo.transform(0,0)
    lon2,lat2 = geo.transform(2,0)
    spacing = geod.inv(lon1,lat1,lon2,lat2)[2]
    assert abs(spacing-2)<1e-7
    report['checks']['centerEastWestGeodesicSpacingM'] = spacing
    report['checks']['orthogonalPixelVectors'] = True
    report['checks']['validMaskOnlyZeroOne'] = bool(np.isin(validity,[0,1]).all())
    report['validPixels'] = int(validity.sum())
    report['noDataPixels'] = int((validity==0).sum())
    report['elevationRangeM'] = [float(np.nanmin(dst)),float(np.nanmax(dst))]
    report['downloadBytes'] = sum(entry['bytes'] for entry in ledger)
    report['httpRequests'] = ledger
    report['versions'] = {'rasterio':rasterio.__version__,'gdal':rasterio.__gdal_version__,'numpy':np.__version__}
    metadata = {
        'id':'jezero-hirise-1km','title':'Jezero · HiRISE real terrain · 1 km²',
        'sourceOrganization':'NASA MRO/HiRISE · University of Arizona · USGS Astrogeology',
        'sourceUrl':ITEM_URL,'horizontalCrs':'MARS_JEZERO_LOCAL_EQC_18_44N_77_45E',
        'horizontalCrsDefinition':local_crs.to_wkt(),
        'coordinateTransform':{'sourceCrs':'IAU_2015:49910','sourceCrsDefinition':info['crsWkt'],'targetCrs':'MARS_JEZERO_LOCAL_EQC_18_44N_77_45E','method':'PROJ inverse source EQC → Mars planetocentric lon/lat → local EQC; nearest DEM, minimum validity','definition':'+proj=eqc +lat_ts=18.44 +lat_0=18.44 +lon_0=77.45 +R=3396190 +units=m; x=R*cos(18.44°)*(lon-77.45°), y=R*(lat-18.44°), angular differences in radians.'},
        'horizontalUnit':'m','verticalUnit':'m','verticalDatum':'Mars2000 Datum: Martian equipotential surface (areoid), per original HiRISE PDS label; MOLA-controlled elevations in meters. No vertical transformation applied.',
        'limitations':['Real NASA/USGS source; independent SCI-03 scientific and operational validation is pending.','2 m output sampling does not imply 2 m horizontal accuracy or resolved terrain detail; stereo matching, jitter, seams and interpolation artifacts may affect slopes.','Source DTM is MOLA-controlled. Source FOM was not classified in this subset; source manual interpolation and low-confidence cells are not identified by the validity mask.','No confirmed hazard layer is available. Valid elevation is not evidence of safe traversal.','Nearest-neighbor reprojection preserves source sampled elevations; validity uses the minimum source mask over each target footprint. NoData is never filled.','Local spherical equirectangular projection is true-scale at 18.44°N; scale varies slightly across the 1 km patch. The grid is an engineering planning projection, not an official EVA safety standard.','STAC acquisition timestamps are inconsistent with the ESP orbit identifiers and are not used as authoritative acquisition dates.'],
        'provenance':'scientific','width':500,'height':500,'cellSizeX':2,'cellSizeY':2,'transform':{'coefficients':list(dst_transform.to_gdal())},
        'imagery':{'assetUrl':'/data/terrain/jezero-hirise-1km/'+image_name,'mimeType':'image/png','description':image_description,'alignment':'terrain-grid'},
    }
    (OUT/'metadata.json').write_text(json.dumps(metadata,indent=2,ensure_ascii=False)+'\n')
    report['sha256'] = {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.iterdir() if p.is_file() and p.name!='validation.json'}
    (OUT/'validation.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    server.shutdown()
    print(json.dumps({key:report[key] for key in ['downloadBytes','validPixels','noDataPixels','elevationRangeM','geographicBounds','checks']},indent=2),flush=True)

if __name__ == '__main__': main()
