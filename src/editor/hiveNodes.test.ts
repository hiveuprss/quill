import { describe, expect, it } from 'vitest';
import { Center, PullLeft, PullRight, Spoiler } from './hiveNodes';

describe('hiveNodes', () => {
  it('defines Hive HTML node names', () => {
    expect(Center.name).toBe('center');
    expect(Spoiler.name).toBe('spoiler');
    expect(PullLeft.name).toBe('pullLeft');
    expect(PullRight.name).toBe('pullRight');
  });

  it('parseHTML and renderHTML return Hive tags', () => {
    const centerParse = Center.config.parseHTML?.call({ name: 'center' } as never);
    expect(centerParse).toEqual([{ tag: 'center' }]);
    const centerRender = Center.config.renderHTML?.call(
      { name: 'center' } as never,
      { HTMLAttributes: {} } as never,
    );
    expect(centerRender?.[0]).toBe('center');

    const spoilerParse = Spoiler.config.parseHTML?.call({ name: 'spoiler' } as never) as
      | Array<{ tag: string; contentElement?: unknown }>
      | undefined;
    expect(spoilerParse?.[0]?.tag).toBe('details');
    expect(typeof spoilerParse?.[0]?.contentElement).toBe('function');
    const spoilerRender = Spoiler.config.renderHTML?.call(
      { name: 'spoiler' } as never,
      { HTMLAttributes: {} } as never,
    ) as unknown[] | undefined;
    expect(spoilerRender?.[0]).toBe('details');
    // Editor keeps details open so the content hole stays editable.
    expect(JSON.stringify(spoilerRender)).toMatch(/"open"/);
    expect(JSON.stringify(spoilerRender)).toMatch(/contenteditable/);

    const left = PullLeft.config.renderHTML?.call(
      { name: 'pullLeft' } as never,
      { HTMLAttributes: {} } as never,
    );
    expect(left?.[0]).toBe('div');
    const right = PullRight.config.renderHTML?.call(
      { name: 'pullRight' } as never,
      { HTMLAttributes: {} } as never,
    );
    expect(right?.[0]).toBe('div');
    expect(PullLeft.config.parseHTML?.call({ name: 'pullLeft' } as never)).toEqual([
      { tag: 'div.pull-left' },
    ]);
    expect(PullRight.config.parseHTML?.call({ name: 'pullRight' } as never)).toEqual([
      { tag: 'div.pull-right' },
    ]);
  });
});
