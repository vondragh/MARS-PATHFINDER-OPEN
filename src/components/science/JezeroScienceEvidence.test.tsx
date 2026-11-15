import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JezeroScienceEvidence } from './JezeroScienceEvidence';

function openEvidence() {
  const summary = screen.getByText('Jezero context & science evidence');
  const disclosure = summary.closest('details')!;
  disclosure.open = true;
  fireEvent(disclosure, new Event('toggle'));
}

describe('Jezero science evidence', () => {
  it('loads imagery only after opening and shows the planning marker only after the tile loads', () => {
    render(<JezeroScienceEvidence />);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    openEvidence();

    const tile = screen.getByRole('img', { name: /Mars Trek regional/ });
    expect(tile).toHaveAttribute('src', expect.stringMatching(/^https:\/\/trek\.nasa\.gov\/.+\/6\/25\/91\.jpg$/));
    expect(screen.queryByText('Jezero planning area')).not.toBeInTheDocument();
    fireEvent.load(tile);
    expect(screen.getByText('Jezero planning area')).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Original image' })).toHaveLength(2);
  });

  it('keeps provenance and unaffected observations available when individual images fail', () => {
    render(<JezeroScienceEvidence />);
    openEvidence();

    fireEvent.error(screen.getByRole('img', { name: /Mars Trek regional/ }));
    fireEvent.error(screen.getByRole('img', { name: 'Layered rock exposure' }));
    fireEvent.load(screen.getByRole('img', { name: 'Rippled sand and exposed rocks' }));

    expect(screen.getByText(/local HiRISE map and routing still work/)).toBeVisible();
    expect(screen.getByText(/NASA preview unavailable/)).toBeVisible();
    expect(screen.getByRole('img', { name: 'Rippled sand and exposed rocks' })).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Original image' })).toHaveLength(2);
    expect(screen.queryByText('Jezero planning area')).not.toBeInTheDocument();
  });

  it('falls back when a NASA image request never completes', () => {
    vi.useFakeTimers();
    try {
      render(<JezeroScienceEvidence />);
      openEvidence();
      fireEvent.load(screen.getByRole('img', { name: 'Layered rock exposure' }));
      act(() => vi.advanceTimersByTime(12_000));

      expect(screen.getByText(/Mars Trek imagery unavailable/)).toBeVisible();
      expect(screen.getAllByText(/NASA preview unavailable/)).toHaveLength(1);
      expect(screen.getByRole('img', { name: 'Layered rock exposure' })).toBeVisible();
      expect(screen.queryByText('Loading NASA imagery…')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
