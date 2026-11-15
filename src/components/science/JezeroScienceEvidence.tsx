import { useEffect, useState } from 'react';
import { galleryUrl, jezeroContext, roverScenes } from './challengeSources';

function SourceImage({ src, alt, unavailable, marker = false }: {
  src: string; alt: string; unavailable: string; marker?: boolean;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  useEffect(() => {
    if (state !== 'loading') return;
    const timer = window.setTimeout(() => setState('unavailable'), 12_000);
    return () => window.clearTimeout(timer);
  }, [state]);
  if (state === 'unavailable') return <p role="status">{unavailable}</p>;
  return <div className="science-source-image">
    <img src={src} alt={alt} referrerPolicy="no-referrer" onLoad={() => setState('ready')} onError={() => setState('unavailable')} />
    {state === 'loading' && <small role="status">Loading NASA imagery…</small>}
    {marker && state === 'ready' && <span className="science-context-marker" style={{ left: `${jezeroContext.markerLeft}%`, top: `${jezeroContext.markerTop}%` }}>
      Jezero planning area
    </span>}
  </div>;
}

export function JezeroScienceEvidence() {
  const [open, setOpen] = useState(false);
  return <section className="config-section science-evidence" aria-labelledby="science-objective">
    <h2 id="science-objective">Scientific objective</h2>
    <p>Plan a reconnaissance traverse to look for visible layering and transitions between exposed rock and sand. Record observations before proposing follow-up sampling.</p>
    <p><strong>Exploration destination:</strong> a planner-selected point. <strong>Validated science site:</strong> none established for this route.</p>
    <details open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>Jezero context &amp; science evidence</summary>
      {open && <>
        <figure>
          <SourceImage src={jezeroContext.tileUrl} alt="Mars Trek regional MOLA shaded relief around Jezero" unavailable="Mars Trek imagery unavailable. The local HiRISE map and routing still work." marker />
          <figcaption>Regional context only · NASA JPL Mars Trek / Mars Global Surveyor MOLA. Marker: 18.44° N, 77.45° E (planning tile center). <a href={jezeroContext.capabilitiesUrl}>WMTS metadata</a></figcaption>
        </figure>
        <h3>Documented rover observations</h3>
        <p>These archival frames illustrate what to look for. They are not pinned to the selected route and do not confirm minerals, samples or terrain hazards there.</p>
        {roverScenes.map(scene => <figure key={scene.id}>
          <SourceImage src={scene.preview} alt={scene.title} unavailable="NASA preview unavailable. The source links remain below." />
          <figcaption>
            <strong>{scene.title}</strong><br />
            Mars 2020 Perseverance · {scene.camera} · Sol {scene.sol}<br />
            <time dateTime={scene.utc}>{scene.utc}</time><br />
            Rover site {scene.site}, drive {scene.drive} (archive indices; no verified map position for this view).<br />
            Credit: {scene.credit}<br />
            <code>{scene.id}</code><br />
            <a href={scene.gallery}>Gallery record</a> · <a href={scene.original}>Original image</a>
          </figcaption>
        </figure>)}
        <a href={galleryUrl}>NASA Perseverance Raw Images Gallery</a>
      </>}
    </details>
  </section>;
}
