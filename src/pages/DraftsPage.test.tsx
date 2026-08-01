import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DraftsPage } from './DraftsPage';
import type { Draft } from '../db/draftsDb';

function draft(partial: Partial<Draft> = {}): Draft {
  const now = Date.now();
  return {
    id: 'draft_1',
    title: 'My post',
    bodyMarkdown: 'body',
    tags: [],
    status: 'local',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('DraftsPage', () => {
  it('shows empty state', async () => {
    const onNew = vi.fn();
    render(
      <MemoryRouter>
        <DraftsPage drafts={[]} onNew={onNew} onDelete={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No drafts yet/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Start writing/i }));
    expect(onNew).toHaveBeenCalled();
  });

  it('shows home footer links on empty state', () => {
    render(
      <MemoryRouter>
        <DraftsPage drafts={[]} onNew={vi.fn()} onDelete={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Powered by/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Hive$/i })).toHaveAttribute(
      'href',
      'https://hive.io',
    );
    expect(screen.getByRole('link', { name: /Hive Discord/i })).toHaveAttribute(
      'href',
      'https://discord.gg/heGaVzSr',
    );
    expect(screen.getByRole('link', { name: /PeakD/i })).toHaveAttribute(
      'href',
      'https://peakd.com/@thequill',
    );
  });

  it('shows home footer when drafts exist', () => {
    render(
      <MemoryRouter>
        <DraftsPage drafts={[draft()]} onNew={vi.fn()} onDelete={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: /PeakD/i })).toBeInTheDocument();
  });

  it('shows relative updated time with absolute title', () => {
    const updatedAt = Date.now() - 3 * 60 * 60 * 1000;
    render(
      <MemoryRouter>
        <DraftsPage
          drafts={[draft({ updatedAt, createdAt: updatedAt })]}
          onNew={vi.fn()}
          onDelete={vi.fn()}
        />
      </MemoryRouter>,
    );
    const time = screen.getByText(/hours ago|hour ago/i);
    expect(time.tagName).toBe('TIME');
    expect(time.getAttribute('title')).toBeTruthy();
    expect(time.getAttribute('dateTime')).toBeTruthy();
  });

  it('lists drafts and confirms delete', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <DraftsPage drafts={[draft()]} onNew={vi.fn()} onDelete={onDelete} />
      </MemoryRouter>,
    );
    expect(screen.getByText('My post')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Delete draft My post/i }));
    expect(screen.getByRole('heading', { name: /Delete this draft/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Delete draft My post/i }));
    await user.click(screen.getByRole('button', { name: /^Delete draft$/i }));
    expect(onDelete).toHaveBeenCalledWith('draft_1');
  });

  it('closes modal on Escape', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DraftsPage drafts={[draft()]} onNew={vi.fn()} onDelete={vi.fn()} />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: /Delete draft My post/i }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('heading', { name: /Delete this draft/i })).not.toBeInTheDocument();
  });
});
