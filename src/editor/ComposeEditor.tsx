import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import {
  FormEvent,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from '../a11y/useFocusTrap';
import type { MediaItem } from '../db/mediaDb';
import { isAllowedImageUrl } from '../hive/upload';
import i18n from '../i18n';
import { Center, Spoiler, PullLeft, PullRight } from './hiveNodes';
import { htmlToMarkdown, markdownToHtml, sanitizePasteHtml, isSafeHref } from './markdown';

type Props = {
  markdown: string;
  onChange: (markdown: string) => void;
  editable?: boolean;
  mediaUsername?: string | null;
  listRecentMedia?: () => Promise<MediaItem[]>;
  onRememberMedia?: (url: string, alt?: string) => Promise<void>;
  onUploadImage?: (file: File) => Promise<string>;
};

type ToolBtnProps = {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  wide?: boolean;
};

type InsertModal = 'link' | 'image' | null;

function ToolBtn({ label, active, onClick, children, wide }: ToolBtnProps) {
  return (
    <button
      type="button"
      className={`tool-btn${active ? ' is-active' : ''}${wide ? ' is-wide' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active ?? false}
      onClick={onClick}
    >
      {/* Decorative glyphs; accessible name comes from aria-label / title */}
      <span aria-hidden="true" className="tool-btn-face">
        {children}
      </span>
    </button>
  );
}

function Sep() {
  return <span className="tool-sep" aria-hidden="true" />;
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}

export function ComposeEditor({
  markdown,
  onChange,
  editable = true,
  mediaUsername = null,
  listRecentMedia,
  onRememberMedia,
  onUploadImage,
}: Props) {
  const { t } = useTranslation();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [modal, setModal] = useState<InsertModal>(null);
  const [url, setUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [alt, setAlt] = useState('');
  const [hadSelection, setHadSelection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<MediaItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pasteUploading, setPasteUploading] = useState(false);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const onUploadImageRef = useRef(onUploadImage);
  const onChangeRef = useRef(onChange);
  const setPasteErrorRef = useRef<(msg: string | null) => void>(() => undefined);
  const setPasteUploadingRef = useRef<(v: boolean) => void>(() => undefined);
  const titleId = useId();
  const descId = useId();

  onUploadImageRef.current = onUploadImage;
  onChangeRef.current = onChange;
  setPasteErrorRef.current = setError;
  setPasteUploadingRef.current = setPasteUploading;
  useFocusTrap(!!modal, modalRef);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        validate: (href) => isSafeHref(href),
      }),
      Image.configure({
        allowBase64: false,
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: () => i18n.t('editor.placeholder'),
      }),
      Center,
      Spoiler,
      PullLeft,
      PullRight,
    ],
    content: markdownToHtml(markdown || ''),
    editable,
    editorProps: {
      transformPastedHTML(html) {
        return sanitizePasteHtml(html);
      },
      handlePaste(view, event) {
        const clip = event.clipboardData;
        if (!clip) return false;

        let imageFile: File | null = null;
        if (clip.files?.length) {
          imageFile = Array.from(clip.files).find((f) => f.type.startsWith('image/')) ?? null;
        }
        if (!imageFile) {
          for (const item of Array.from(clip.items ?? [])) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
              imageFile = item.getAsFile();
              if (imageFile) break;
            }
          }
        }

        if (imageFile) {
          event.preventDefault();
          const upload = onUploadImageRef.current;
          if (!upload) {
            setPasteErrorRef.current(i18n.t('compose.errUploadNeedEnroll'));
            return true;
          }
          const file = imageFile;
          void (async () => {
            setPasteUploadingRef.current(true);
            setPasteErrorRef.current(null);
            try {
              const src = await upload(file);
              const imageType = view.state.schema.nodes.image;
              if (imageType) {
                const node = imageType.create({ src, alt: '' });
                view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
              } else {
                view.dispatch(view.state.tr.insertText(`![](${src})`));
              }
            } catch (err) {
              setPasteErrorRef.current(
                err instanceof Error ? err.message : i18n.t('compose.errUploadRejected'),
              );
            } finally {
              setPasteUploadingRef.current(false);
            }
          })();
          return true;
        }

        const text = clip.getData('text/plain');
        const html = clip.getData('text/html');
        if (html && /<script/i.test(html)) {
          event.preventDefault();
          if (text) {
            view.dispatch(view.state.tr.insertText(text));
          }
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChangeRef.current(htmlToMarkdown(ed.getHTML()));
    },
  });

  useEffect(() => {
    if (!editor) return;
    const onSel = () => bump();
    editor.on('selectionUpdate', onSel);
    editor.on('transaction', onSel);
    return () => {
      editor.off('selectionUpdate', onSel);
      editor.off('transaction', onSel);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const current = htmlToMarkdown(editor.getHTML()).trim();
    if (markdown.trim() !== current) {
      editor.commands.setContent(markdownToHtml(markdown || ''), false);
    }
  }, [markdown, editor]);

  useEffect(() => {
    if (!modal) return;
    if (modal === 'link') urlInputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modal]);

  useEffect(() => {
    if (modal !== 'image') return;
    let cancelled = false;
    async function load() {
      if (!listRecentMedia || !mediaUsername) {
        setRecent([]);
        return;
      }
      setGalleryLoading(true);
      try {
        const items = await listRecentMedia();
        if (!cancelled) setRecent(items);
      } catch {
        if (!cancelled) setRecent([]);
      } finally {
        if (!cancelled) setGalleryLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [modal, listRecentMedia, mediaUsername]);

  function closeModal() {
    setModal(null);
    setUrl('');
    setLinkText('');
    setAlt('');
    setError(null);
    setHadSelection(false);
    setUploading(false);
  }

  function openLinkModal() {
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const { empty, from, to } = editor.state.selection;
    const selected = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
    setHadSelection(!empty);
    setLinkText(selected);
    setUrl('');
    setError(null);
    setModal('link');
  }

  function openImageModal() {
    setUrl('');
    setAlt('');
    setError(null);
    setModal('image');
  }

  function applyLink(e: FormEvent) {
    e.preventDefault();
    if (!editor) return;
    const href = url.trim();
    if (!href || !isSafeHref(href)) {
      setError(t('editor.errUnsafeLink'));
      return;
    }
    const label = linkText.trim() || href;
    if (!hadSelection) {
      const safeHref = escapeAttr(href);
      const safeLabel = label
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      editor.chain().focus().insertContent(`<a href="${safeHref}">${safeLabel}</a>`).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    closeModal();
  }

  function insertImageAtCursor(src: string, altText: string) {
    if (!editor) return;
    const ok = editor.chain().focus().setImage({ src, alt: altText }).run();
    if (!ok) {
      const safeSrc = escapeAttr(src);
      const safeAlt = escapeAttr(altText);
      editor
        .chain()
        .focus()
        .insertContent(`<img src="${safeSrc}" alt="${safeAlt}" />`)
        .run();
    }
    if (onRememberMedia && isAllowedImageUrl(src)) {
      void onRememberMedia(src, altText || undefined);
    }
  }

  function applyImage(e: FormEvent) {
    e.preventDefault();
    if (!editor) return;
    const src = url.trim();
    // Any https URL is intentional (Hive posts often embed third-party images).
    // Library remember only runs for images.hive.blog via isAllowedImageUrl.
    if (!src || !/^https:\/\//i.test(src)) {
      setError(t('editor.errImageHttps'));
      return;
    }
    insertImageAtCursor(src, alt.trim());
    closeModal();
  }

  function pickFromGallery(item: MediaItem) {
    insertImageAtCursor(item.url, alt.trim() || item.alt || '');
    closeModal();
  }

  async function onModalUpload(file: File) {
    if (!onUploadImage) return;
    setError(null);
    setUploading(true);
    try {
      const src = await onUploadImage(file);
      insertImageAtCursor(src, alt.trim());
      if (listRecentMedia && mediaUsername) {
        try {
          setRecent(await listRecentMedia());
        } catch {
          /* ignore */
        }
      }
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setUploading(false);
    }
  }

  if (!editor) return null;

  const inTable = editor.isActive('table');

  return (
    <div className="compose-editor">
      {!modal && error && <div className="banner danger">{error}</div>}
      {pasteUploading && <div className="banner info">{t('editor.pasteUploading')}</div>}
      <div className="toolbar" role="toolbar" aria-label={t('editor.formatting')}>
        <div className="tool-group" role="group" aria-label={t('editor.textStyle')}>
          <ToolBtn
            label={t('editor.bold')}
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <span className="glyph glyph-b">B</span>
          </ToolBtn>
          <ToolBtn
            label={t('editor.italic')}
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <span className="glyph glyph-i">I</span>
          </ToolBtn>
          <ToolBtn
            label={t('editor.inlineCode')}
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <span className="glyph glyph-code">{'<>'}</span>
          </ToolBtn>
        </div>

        <Sep />

        <div className="tool-group" role="group" aria-label={t('editor.headings')}>
          <ToolBtn
            label={t('editor.heading2')}
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <span className="glyph glyph-h">
              H<sub>2</sub>
            </span>
          </ToolBtn>
          <ToolBtn
            label={t('editor.heading3')}
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <span className="glyph glyph-h">
              H<sub>3</sub>
            </span>
          </ToolBtn>
        </div>

        <Sep />

        <div className="tool-group" role="group" aria-label={t('editor.blocks')}>
          <ToolBtn
            label={t('editor.quote')}
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <span className="glyph glyph-quote">”</span>
          </ToolBtn>
          <ToolBtn
            label={t('editor.bulletList')}
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <svg className="glyph-svg" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="2.5" cy="4" r="1.2" fill="currentColor" />
              <rect x="5.5" y="3.2" width="9" height="1.6" rx="0.4" fill="currentColor" />
              <circle cx="2.5" cy="8" r="1.2" fill="currentColor" />
              <rect x="5.5" y="7.2" width="9" height="1.6" rx="0.4" fill="currentColor" />
              <circle cx="2.5" cy="12" r="1.2" fill="currentColor" />
              <rect x="5.5" y="11.2" width="9" height="1.6" rx="0.4" fill="currentColor" />
            </svg>
          </ToolBtn>
          <ToolBtn
            label={t('editor.numberedList')}
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <svg className="glyph-svg" viewBox="0 0 16 16" aria-hidden="true">
              <text x="1" y="5.2" fontSize="4.5" fill="currentColor" fontFamily="sans-serif">
                1
              </text>
              <rect x="5.5" y="3.2" width="9" height="1.6" rx="0.4" fill="currentColor" />
              <text x="1" y="9.2" fontSize="4.5" fill="currentColor" fontFamily="sans-serif">
                2
              </text>
              <rect x="5.5" y="7.2" width="9" height="1.6" rx="0.4" fill="currentColor" />
              <text x="1" y="13.2" fontSize="4.5" fill="currentColor" fontFamily="sans-serif">
                3
              </text>
              <rect x="5.5" y="11.2" width="9" height="1.6" rx="0.4" fill="currentColor" />
            </svg>
          </ToolBtn>
          <ToolBtn
            label={t('editor.codeBlock')}
            active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <svg className="glyph-svg" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M5.2 3.2 1.8 8l3.4 4.8M10.8 3.2 14.2 8l-3.4 4.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </ToolBtn>
          <ToolBtn
            label={t('editor.divider')}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <svg className="glyph-svg" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="1" y="7.2" width="14" height="1.6" rx="0.6" fill="currentColor" />
            </svg>
          </ToolBtn>
        </div>

        <Sep />

        <div className="tool-group" role="group" aria-label={t('editor.insert')}>
          <ToolBtn
            label={t('editor.link')}
            active={editor.isActive('link')}
            onClick={openLinkModal}
          >
            <svg className="glyph-svg" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M6.2 9.8a2.8 2.8 0 0 1 0-4l1.6-1.6a2.8 2.8 0 1 1 4 4L10.6 9.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M9.8 6.2a2.8 2.8 0 0 1 0 4L8.2 11.8a2.8 2.8 0 1 1-4-4L5.4 6.6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </ToolBtn>
          <ToolBtn label={t('editor.insertImage')} onClick={openImageModal}>
            <svg className="glyph-svg" viewBox="0 0 16 16" aria-hidden="true">
              <rect
                x="1.5"
                y="2.5"
                width="13"
                height="11"
                rx="1.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <circle cx="5.2" cy="6" r="1.2" fill="currentColor" />
              <path
                d="M1.8 11.5 5.5 8l2.2 2.2 2.3-2.8 4.2 4.1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
          </ToolBtn>
        </div>

        <Sep />

        <div className="tool-group tool-group-hive" role="group" aria-label={t('editor.hiveLayout')}>
          <ToolBtn
            label={t('editor.center')}
            active={editor.isActive('center')}
            wide
            onClick={() => editor.chain().focus().toggleWrap('center').run()}
          >
            <span className="glyph-label">{t('editor.center')}</span>
          </ToolBtn>
          <ToolBtn
            label={t('editor.spoiler')}
            active={editor.isActive('spoiler')}
            wide
            onClick={() => editor.chain().focus().toggleWrap('spoiler').run()}
          >
            <span className="glyph-label">{t('editor.spoiler')}</span>
          </ToolBtn>
          <ToolBtn
            label={t('editor.pullLeft')}
            active={editor.isActive('pullLeft')}
            wide
            onClick={() => editor.chain().focus().toggleWrap('pullLeft').run()}
          >
            <span className="glyph-label">{t('editor.pullLeft')}</span>
          </ToolBtn>
          <ToolBtn
            label={t('editor.pullRight')}
            active={editor.isActive('pullRight')}
            wide
            onClick={() => editor.chain().focus().toggleWrap('pullRight').run()}
          >
            <span className="glyph-label">{t('editor.pullRight')}</span>
          </ToolBtn>
        </div>

        <Sep />

        {/* Trailing group so +row/+col expansion does not shift earlier controls */}
        <div className="tool-group tool-group-table" role="group" aria-label={t('editor.table')}>
          <ToolBtn
            label={t('editor.insertTable')}
            active={inTable}
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            <svg className="glyph-svg" viewBox="0 0 16 16" aria-hidden="true">
              <rect
                x="1.5"
                y="2.5"
                width="13"
                height="11"
                rx="1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <line x1="1.5" y1="6.2" x2="14.5" y2="6.2" stroke="currentColor" strokeWidth="1.2" />
              <line x1="1.5" y1="9.8" x2="14.5" y2="9.8" stroke="currentColor" strokeWidth="1.2" />
              <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="10.5" y1="2.5" x2="10.5" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </ToolBtn>
          {inTable && (
            <>
              <ToolBtn
                label={t('editor.addRow')}
                wide
                onClick={() => editor.chain().focus().addRowAfter().run()}
              >
                <span className="glyph-label">{t('editor.addRowShort')}</span>
              </ToolBtn>
              <ToolBtn
                label={t('editor.addColumn')}
                wide
                onClick={() => editor.chain().focus().addColumnAfter().run()}
              >
                <span className="glyph-label">{t('editor.addColumnShort')}</span>
              </ToolBtn>
              <ToolBtn
                label={t('editor.deleteTable')}
                wide
                onClick={() => editor.chain().focus().deleteTable().run()}
              >
                <span className="glyph-label">{t('editor.deleteTableShort')}</span>
              </ToolBtn>
            </>
          )}
        </div>
      </div>
      <EditorContent editor={editor} className="ProseMirror-wrap" />

      {modal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            ref={modalRef}
            className={`modal${modal === 'image' ? ' modal-wide' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
          >
            <h2 id={titleId} className="modal-title">
              {modal === 'link' ? t('editor.linkModalTitle') : t('editor.imageModalTitle')}
            </h2>
            <p id={descId} className="modal-body">
              {modal === 'link' ? t('editor.linkModalBody') : t('editor.imageModalBody')}
            </p>

            {modal === 'image' && (
              <div className="media-gallery-block">
                <div className="media-gallery-label">{t('editor.recentUploads')}</div>
                {galleryLoading ? (
                  <p className="muted media-gallery-empty">{t('editor.galleryLoading')}</p>
                ) : recent.length === 0 ? (
                  <p className="muted media-gallery-empty">{t('editor.noUploadsYet')}</p>
                ) : (
                  <div className="media-gallery" role="list">
                    {recent.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="media-thumb"
                        role="listitem"
                        title={item.url}
                        onClick={() => pickFromGallery(item)}
                      >
                        <img
                          src={item.url}
                          alt={item.alt || t('editor.recentUploadAlt')}
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                )}
                {onUploadImage && (
                  <div className="media-upload-row">
                    <button
                      type="button"
                      className="btn"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? t('editor.uploading') : t('editor.uploadNew')}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onModalUpload(f);
                        e.target.value = '';
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            <form
              className="form-stack modal-form"
              onSubmit={modal === 'link' ? applyLink : applyImage}
            >
              <label>
                {t('editor.url')}
                <input
                  ref={urlInputRef}
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder={
                    modal === 'link'
                      ? t('editor.linkUrlPlaceholder')
                      : t('editor.imageUrlPlaceholder')
                  }
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setError(null);
                  }}
                />
              </label>
              {modal === 'link' && (
                <label>
                  {t('editor.linkText')}
                  <input
                    type="text"
                    placeholder={t('editor.linkTextPlaceholder')}
                    value={linkText}
                    onChange={(e) => setLinkText(e.target.value)}
                  />
                </label>
              )}
              {modal === 'image' && (
                <label>
                  {t('editor.altText')}
                  <input
                    type="text"
                    placeholder={t('editor.altPlaceholder')}
                    value={alt}
                    onChange={(e) => setAlt(e.target.value)}
                  />
                </label>
              )}
              {error && <div className="banner danger">{error}</div>}
              <div className="modal-actions">
                <button type="button" className="btn" onClick={closeModal}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn primary" disabled={uploading}>
                  {modal === 'link' ? t('editor.insertLink') : t('editor.insertImage')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
