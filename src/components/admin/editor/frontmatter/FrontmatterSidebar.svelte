<script lang="ts">
import type {
  AdminContentCollectionKey
} from '../../../../lib/admin-console/content-collections';
import type {
  AdminContentWorkspaceEditorValues
} from '../../../../lib/admin-console/content-editor-payload';
import type { BitsCardAuthorInput } from '../../../../lib/bits-card-view-model';
import { getAdminImageFieldPreviewSrc } from '../../../../lib/admin-console/image-params';
import { parseEssayDateInput } from '../../../../utils/date-only';
import AdminEditorIcon from '../shared/AdminEditorIcon.svelte';
import FrontmatterTagsInput from './FrontmatterTagsInput.svelte';
import {
  isBitsEditorValues,
  isEssayEditorValues
} from '../shared/content-editor-adapters';
import {
  getFieldDescribedBy as getSharedFieldDescribedBy,
  getFieldIssueId as getSharedFieldIssueId
} from '../shared/field-issue-a11y';

type AdminContentIssue = {
  path: string;
  message: string;
};

type AuthorLibraryProfile = {
  name: string;
  avatar: string;
};

type Props = {
  value: AdminContentWorkspaceEditorValues;
  collection?: AdminContentCollectionKey;
  issues?: readonly AdminContentIssue[];
  disabled?: boolean;
  entryId?: string;
  showEntryId?: boolean;
  slugPlaceholder?: string;
  bitsDefaultAuthor?: BitsCardAuthorInput;
  authorProfiles?: readonly AuthorLibraryProfile[];
  ariaLabel?: string;
  fieldScope?: 'all' | 'bits-summary';
  onEntryIdInput?: (value: string) => void;
  onDirty?: () => void;
};

let {
  value = $bindable(),
  collection = 'longform',
  issues = [],
  disabled = false,
  entryId = '',
  showEntryId = false,
  slugPlaceholder = '',
  bitsDefaultAuthor = {},
  authorProfiles = [],
  ariaLabel = '内容字段',
  fieldScope = 'all',
  onEntryIdInput = () => {},
  onDirty = () => {}
}: Props = $props();

let authorSearchText = $state('');
let translatorSearchText = $state('');

const AUTHOR_LIBRARY_LIST_ID = 'admin-essay-author-library-options';
const TRANSLATOR_LIBRARY_LIST_ID = 'admin-essay-translator-library-options';

const getIssue = (path: string): string =>
  issues.find((issue) => issue.path === path)?.message ?? '';

const getIssueByPrefix = (prefix: string): string =>
  issues.find((issue) => issue.path.startsWith(prefix))?.message ?? '';

const FRONTMATTER_ISSUE_ID_SCOPE = 'admin-frontmatter';

const getFieldIssueId = (path: string): string =>
  getSharedFieldIssueId(FRONTMATTER_ISSUE_ID_SCOPE, path);

const getFieldDescribedBy = (
  path: string,
  issue = getIssue(path),
  extraIds: readonly string[] = []
): string | undefined => {
  return getSharedFieldDescribedBy(FRONTMATTER_ISSUE_ID_SCOPE, path, issue, extraIds);
};

const base = import.meta.env.BASE_URL ?? '/';

const padDatePart = (value: number): string => String(value).padStart(2, '0');

const formatLocalDateText = (date: Date): string => {
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());
  return `${year}-${month}-${day}`;
};

const getLocalDateText = (): string => formatLocalDateText(new Date());

const normalizePersonKey = (value: string): string => value.trim().toLocaleLowerCase();

const authorLibraryOptions = $derived(
  Array.from(
    authorProfiles.reduce((profiles, profile) => {
      const name = profile.name.trim();
      if (!name) return profiles;

      const key = normalizePersonKey(name);
      const existing = profiles.get(key);
      profiles.set(key, {
        name,
        avatar: existing?.avatar || profile.avatar.trim()
      });
      return profiles;
    }, new Map<string, AuthorLibraryProfile>()).values()
  ).sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))
);

const authorProfileByName = $derived(
  new Map(authorLibraryOptions.map((profile) => [normalizePersonKey(profile.name), profile]))
);

const splitPersonNames = (value: string): string[] =>
  Array.from(new Set(value.split(/\r?\n|[,，、；;]+/).map((item) => item.trim()).filter(Boolean)));

const splitPersonAvatarLines = (value: string): string[] =>
  value.replace(/\r\n?/g, '\n').split('\n').map((item) => item.trim());

const trimTrailingBlankItems = (items: string[]): string[] => {
  while (items.length > 0 && !items[items.length - 1]) items.pop();
  return items;
};

const getAuthorProfileByName = (name: string): AuthorLibraryProfile | null =>
  authorProfileByName.get(normalizePersonKey(name)) ?? null;

const getAuthorProfileBySearchText = (searchText: string): AuthorLibraryProfile | null => {
  const normalized = normalizePersonKey(searchText);
  if (!normalized) return null;
  return getAuthorProfileByName(searchText)
    ?? authorLibraryOptions.find((profile) => normalizePersonKey(profile.name).includes(normalized))
    ?? null;
};

const getCurrentEssayAuthorNames = (): string[] =>
  isEssayEditorValues(value) ? splitPersonNames(value.authorsText || value.authorName) : [];

const getCurrentEssayAuthorAvatars = (): string[] => {
  if (!isEssayEditorValues(value)) return [];
  const avatars = splitPersonAvatarLines(value.authorAvatarsText);
  if (avatars.length === 0 && value.authorAvatar.trim()) return [value.authorAvatar.trim()];
  if (value.authorAvatar.trim() && !avatars[0]) avatars[0] = value.authorAvatar.trim();
  return avatars;
};

const syncEssayAuthorFields = (names: string[], avatars: string[]) => {
  if (!isEssayEditorValues(value)) return;
  const nextAvatars = trimTrailingBlankItems(avatars.slice(0, names.length));
  value.authorsText = names.join('\n');
  value.authorName = names[0] ?? '';
  value.authorAvatar = nextAvatars[0] ?? '';
  value.authorAvatarsText = nextAvatars.length > 0 ? nextAvatars.join('\n') : '';
};

const handleAuthorsTextInput = () => {
  if (!isEssayEditorValues(value)) return;
  const names = splitPersonNames(value.authorsText);
  const currentAvatars = getCurrentEssayAuthorAvatars();
  const nextAvatars = names.map((name, index) =>
    getAuthorProfileByName(name)?.avatar || currentAvatars[index] || ''
  );
  syncEssayAuthorFields(names, nextAvatars);
};

const applyAuthorProfile = (profile: AuthorLibraryProfile) => {
  if (!isEssayEditorValues(value)) return;
  const currentNames = getCurrentEssayAuthorNames();
  const currentAvatars = getCurrentEssayAuthorAvatars();
  const profileKey = normalizePersonKey(profile.name);
  const existingIndex = currentNames.findIndex((name) => normalizePersonKey(name) === profileKey);
  const nextNames = existingIndex === -1 ? [...currentNames, profile.name] : [...currentNames];
  const nextAvatars = [...currentAvatars];
  const targetIndex = existingIndex === -1 ? nextNames.length - 1 : existingIndex;
  if (profile.avatar) nextAvatars[targetIndex] = profile.avatar;
  syncEssayAuthorFields(nextNames, nextAvatars);
  authorSearchText = '';
  onDirty?.();
};

const applyAuthorSearch = () => {
  const profile = getAuthorProfileBySearchText(authorSearchText);
  if (!profile) return;
  applyAuthorProfile(profile);
};

const applyTranslatorProfile = (profile: AuthorLibraryProfile) => {
  if (!isEssayEditorValues(value)) return;
  value.translationTranslator = profile.name;
  if (profile.avatar) value.translationAvatar = profile.avatar;
  translatorSearchText = '';
  onDirty?.();
};

const applyTranslatorSearch = () => {
  const profile = getAuthorProfileBySearchText(translatorSearchText || (isEssayEditorValues(value) ? value.translationTranslator : ''));
  if (!profile) return;
  applyTranslatorProfile(profile);
};

const applyTranslatorFromCurrentValue = () => {
  if (!isEssayEditorValues(value)) return;
  const profile = getAuthorProfileByName(value.translationTranslator);
  if (profile) applyTranslatorProfile(profile);
};

const handleAuthorSearchKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  applyAuthorSearch();
};

const handleTranslatorSearchKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  applyTranslatorSearch();
};

const getLocalTimezoneOffsetText = (date: Date): string => {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffsetMinutes = Math.abs(offsetMinutes);
  const hours = padDatePart(Math.floor(absoluteOffsetMinutes / 60));
  const minutes = padDatePart(absoluteOffsetMinutes % 60);
  return `${sign}${hours}:${minutes}`;
};

const formatLocalDateTimeWithZoneText = (date: Date): string => {
  const hours = padDatePart(date.getHours());
  const minutes = padDatePart(date.getMinutes());
  const seconds = padDatePart(date.getSeconds());
  return `${formatLocalDateText(date)}T${hours}:${minutes}:${seconds}${getLocalTimezoneOffsetText(date)}`;
};

const getPublishedAtResult = (value: string) => {
  const result = parseEssayDateInput(value);
  return result?.publishedAt ? result : null;
};

const getPublishedAtSyncDate = (value: string): string =>
  getPublishedAtResult(value)?.dateText ?? '';

const getEffectivePublishDateResult = (date: string, publishedAt: string) =>
  getPublishedAtResult(publishedAt) ?? parseEssayDateInput(date);

const getPublishedAtInputIssue = (value: string): string =>
  value.trim() && !getPublishedAtResult(value)
    ? '需填写带时区的合法 ISO 日期时间'
    : '';

const getUpdatedAtInputIssue = (value: string, date: string, publishedAt: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const result = parseEssayDateInput(trimmed);
  if (!result) {
    return '需填写 YYYY-MM-DD 或带时区的合法 ISO 日期时间';
  }

  const publishDateResult = getEffectivePublishDateResult(date, publishedAt);
  return publishDateResult && result.date.valueOf() < publishDateResult.date.valueOf()
    ? '更新日期不能早于发布日期'
    : '';
};

const publishedAtSyncDate = $derived(
  isEssayEditorValues(value) ? getPublishedAtSyncDate(value.publishedAt) : ''
);
const publishedAtSyncMessage = $derived(
  isEssayEditorValues(value) && publishedAtSyncDate && value.date !== publishedAtSyncDate
    ? `发布日期与详细时间不一致，保存后将自动更新发布日期为 ${publishedAtSyncDate}`
    : ''
);
const publishedAtIssue = $derived(
  getIssue('publishedAt') || (isEssayEditorValues(value) ? getPublishedAtInputIssue(value.publishedAt) : '')
);
const updatedAtIssue = $derived(
  getIssue('updatedAt') || (isEssayEditorValues(value) ? getUpdatedAtInputIssue(value.updatedAt, value.date, value.publishedAt) : '')
);
const essayAuthorIssue = $derived(getIssue('authorsText') || getIssue('authorName'));
const essayAuthorAvatarIssue = $derived(getIssue('authorAvatarsText') || getIssue('authorAvatar'));
const essayAuthorPreviewItems = $derived(
  isEssayEditorValues(value)
    ? getCurrentEssayAuthorNames().map((name, index) => {
        const avatar = (getCurrentEssayAuthorAvatars()[index] || getAuthorProfileByName(name)?.avatar || '').trim();
        return {
          name,
          avatar,
          previewSrc: avatar ? getAdminImageFieldPreviewSrc('page.bits.defaultAuthor.avatar', avatar, base) : null,
          fallback: Array.from(name.trim()).at(0)?.toUpperCase() ?? '?'
        };
      })
    : []
);

const setPublishedAtNow = () => {
  if (!isEssayEditorValues(value)) return;
  const now = new Date();
  value.date = formatLocalDateText(now);
  value.publishedAt = formatLocalDateTimeWithZoneText(now);
  onDirty?.();
};

const setUpdatedAtToday = () => {
  if (!isEssayEditorValues(value)) return;
  value.updatedAt = getLocalDateText();
  onDirty?.();
};

const bitsImagesIssue = $derived(getIssue('imagesText') || getIssueByPrefix('images['));
const bitsAuthorIssue = $derived(getIssue('authorName') || getIssue('authorAvatar'));
const bitsAuthorNameText = $derived(
  isBitsEditorValues(value)
    ? value.authorName.trim() || bitsDefaultAuthor.name?.trim() || '未设置'
    : ''
);
const bitsAuthorAvatarText = $derived(
  isBitsEditorValues(value)
    ? value.authorAvatar.trim() || bitsDefaultAuthor.avatar?.trim() || ''
    : ''
);
const bitsAuthorAvatarPreviewSrc = $derived(
  bitsAuthorAvatarText
    ? getAdminImageFieldPreviewSrc('page.bits.defaultAuthor.avatar', bitsAuthorAvatarText, base)
    : null
);
const bitsAuthorAvatarFallback = $derived(
  Array.from(bitsAuthorNameText.trim()).at(0)?.toUpperCase() ?? '?'
);
</script>

<aside class="admin-editor-frontmatter" aria-label={ariaLabel}>
  <div class="admin-editor-frontmatter__fields">
    {#if collection === 'longform' && isEssayEditorValues(value)}
      <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('title'))}>
        <span class="admin-field__label">文章标题</span>
        <input
          class="admin-field__control"
          name="title"
          type="text"
          bind:value={value.title}
          aria-invalid={getIssue('title') ? 'true' : undefined}
          aria-describedby={getFieldDescribedBy('title')}
          {disabled}
        />
        <p id={getFieldIssueId('title')} class="admin-content-editor__error" hidden={!getIssue('title')}>{getIssue('title')}</p>
      </label>

      {#if showEntryId}
        <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('entryId'))}>
          <span class="admin-field__label">源文件名</span>
          <input
            class="admin-field__control"
            name="entryId"
            type="text"
            value={entryId}
            spellcheck="false"
            aria-invalid={getIssue('entryId') ? 'true' : undefined}
            aria-describedby={getFieldDescribedBy('entryId')}
            {disabled}
            oninput={(event) => onEntryIdInput(event.currentTarget.value)}
          />
          <p id={getFieldIssueId('entryId')} class="admin-content-editor__error" hidden={!getIssue('entryId')}>{getIssue('entryId')}</p>
        </label>
      {/if}

      <div class="admin-editor-frontmatter__datetime-grid">
        <div class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('date'))}>
          <label class="admin-field__label" for="admin-essay-date">发布日期</label>
          <input
            id="admin-essay-date"
            class="admin-field__control"
            name="date"
            type="date"
            bind:value={value.date}
            aria-invalid={getIssue('date') ? 'true' : undefined}
            aria-describedby={getFieldDescribedBy('date')}
            {disabled}
          />
          <p id={getFieldIssueId('date')} class="admin-content-editor__error" hidden={!getIssue('date')}>{getIssue('date')}</p>
        </div>

        <div class="admin-field admin-content-editor__field" class:is-invalid={Boolean(publishedAtIssue)}>
          <div class="admin-editor-frontmatter__label-row admin-editor-frontmatter__label-row--with-action">
            <span class="admin-editor-frontmatter__label-help">
              <label class="admin-field__label" for="admin-essay-published-at">详细时间（可选）</label>
              <button
                class="admin-editor-frontmatter__hint-trigger"
                type="button"
                aria-label="详细时间说明"
                aria-describedby="admin-essay-published-at-tip"
              >
                <AdminEditorIcon name="info" size={13} strokeWidth={2} />
              </button>
              <span id="admin-essay-published-at-tip" class="admin-editor-frontmatter__tooltip" role="tooltip">
                按 ISO 日期时间填写，需包含时区，日期需与发布日期一致；留空时仅使用发布日期。
              </span>
            </span>
            <button
              class="admin-editor-frontmatter__text-action"
              type="button"
              onclick={setPublishedAtNow}
              disabled={disabled}
            >
              设为当前
            </button>
          </div>
          <input
            id="admin-essay-published-at"
            class="admin-field__control"
            name="publishedAt"
            type="text"
            bind:value={value.publishedAt}
            placeholder="2024-11-23T18:00:00+08:00"
            aria-invalid={publishedAtIssue ? 'true' : undefined}
            aria-describedby={getFieldDescribedBy('publishedAt', publishedAtIssue, ['admin-essay-published-at-tip'])}
            {disabled}
          />
        </div>

        <p id={getFieldIssueId('publishedAt')} class="admin-editor-frontmatter__note admin-editor-frontmatter__note--error admin-editor-frontmatter__note--wide" hidden={!publishedAtIssue}>
          {publishedAtIssue}
        </p>
        <p class="admin-editor-frontmatter__note admin-editor-frontmatter__note--wide" hidden={!publishedAtSyncMessage}>
          {publishedAtSyncMessage}
        </p>
      </div>

      <div class="admin-editor-frontmatter__datetime-grid">
        <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('badge'))}>
          <span class="admin-field__label">badge</span>
          <input
            class="admin-field__control"
            name="badge"
            type="text"
            bind:value={value.badge}
            aria-invalid={getIssue('badge') ? 'true' : undefined}
            aria-describedby={getFieldDescribedBy('badge')}
            {disabled}
          />
          <p id={getFieldIssueId('badge')} class="admin-content-editor__error" hidden={!getIssue('badge')}>{getIssue('badge')}</p>
        </label>

        <div class="admin-field admin-content-editor__field" class:is-invalid={Boolean(updatedAtIssue)}>
          <div class="admin-editor-frontmatter__label-row admin-editor-frontmatter__label-row--with-action">
            <span class="admin-editor-frontmatter__label-help">
              <label class="admin-field__label" for="admin-essay-updated-at">更新日期（可选）</label>
              <button
                class="admin-editor-frontmatter__hint-trigger"
                type="button"
                aria-label="更新日期说明"
                aria-describedby="admin-essay-updated-at-tip"
              >
                <AdminEditorIcon name="info" size={13} strokeWidth={2} />
              </button>
              <span id="admin-essay-updated-at-tip" class="admin-editor-frontmatter__tooltip" role="tooltip">
                支持 YYYY-MM-DD 或 ISO 日期时间，需包含时区；填写后文章日期显示为“更新于：YYYY-MM-DD”。
              </span>
            </span>
            <button
              class="admin-editor-frontmatter__text-action"
              type="button"
              onclick={setUpdatedAtToday}
              disabled={disabled}
            >
              设为今日
            </button>
          </div>
          <input
            id="admin-essay-updated-at"
            class="admin-field__control"
            name="updatedAt"
            type="text"
            bind:value={value.updatedAt}
            placeholder="2026-01-02"
            aria-invalid={updatedAtIssue ? 'true' : undefined}
            aria-describedby={getFieldDescribedBy('updatedAt', updatedAtIssue, ['admin-essay-updated-at-tip'])}
            {disabled}
          />
        </div>

        <p id={getFieldIssueId('updatedAt')} class="admin-editor-frontmatter__note admin-editor-frontmatter__note--error admin-editor-frontmatter__note--wide" hidden={!updatedAtIssue}>
          {updatedAtIssue}
        </p>
      </div>

      <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('description'))}>
        <span class="admin-field__label">摘要</span>
        <textarea
          class="admin-field__control"
          name="description"
          bind:value={value.description}
          rows="3"
          aria-invalid={getIssue('description') ? 'true' : undefined}
          aria-describedby={getFieldDescribedBy('description')}
          {disabled}
        ></textarea>
        <p id={getFieldIssueId('description')} class="admin-content-editor__error" hidden={!getIssue('description')}>{getIssue('description')}</p>
      </label>

      <div class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('slug'))}>
        <label class="admin-field__label" for="admin-essay-slug">公开 URL 别名（可选）</label>
        <input
          id="admin-essay-slug"
          class="admin-field__control"
          name="slug"
          type="text"
          bind:value={value.slug}
          placeholder={slugPlaceholder}
          spellcheck="false"
          aria-invalid={getIssue('slug') ? 'true' : undefined}
          aria-describedby={getFieldDescribedBy('slug')}
          {disabled}
        />
        <p id={getFieldIssueId('slug')} class="admin-content-editor__error" hidden={!getIssue('slug')}>{getIssue('slug')}</p>
      </div>


      <div class="admin-field admin-content-editor__field" class:is-invalid={Boolean(essayAuthorIssue)}>
        <label class="admin-field__label" for="admin-essay-authors">作者</label>
        <textarea
          id="admin-essay-authors"
          class="admin-field__control"
          name="authorsText"
          bind:value={value.authorsText}
          rows="3"
          placeholder="每行一位作者"
          aria-invalid={essayAuthorIssue ? 'true' : undefined}
          aria-describedby={getFieldDescribedBy('authorsText', essayAuthorIssue)}
          oninput={handleAuthorsTextInput}
          {disabled}
        ></textarea>
        {#if authorLibraryOptions.length > 0}
          <div class="admin-editor-frontmatter__library-combo admin-editor-frontmatter__library-combo--inline">
            <input
              class="admin-field__control admin-editor-frontmatter__library-search"
              type="search"
              bind:value={authorSearchText}
              list={AUTHOR_LIBRARY_LIST_ID}
              placeholder="输入姓名检索作者"
              aria-label="检索作者库"
              disabled={disabled}
              onkeydown={handleAuthorSearchKeydown}
            />
            <button
              class="admin-btn admin-btn--secondary admin-btn--compact admin-btn--icon admin-editor-frontmatter__library-add"
              type="button"
              aria-label="添加作者"
              title="添加作者"
              disabled={disabled || !authorSearchText.trim()}
              onclick={applyAuthorSearch}
            >
              <AdminEditorIcon name="plus" size={15} strokeWidth={2} />
            </button>
          </div>
          <datalist id={AUTHOR_LIBRARY_LIST_ID}>
            {#each authorLibraryOptions as profile (profile.name)}
              <option value={profile.name}>{profile.avatar || profile.name}</option>
            {/each}
          </datalist>
        {/if}
        <p id={getFieldIssueId('authorsText')} class="admin-content-editor__error" hidden={!essayAuthorIssue}>{essayAuthorIssue}</p>
      </div>

      <div class="admin-field admin-content-editor__field admin-editor-frontmatter__author-avatar-field" class:is-invalid={Boolean(essayAuthorAvatarIssue)}>
        <div class="admin-editor-frontmatter__author-display-heading">
          <span class="admin-field__label">作者显示</span>
          <label class="admin-editor-frontmatter__inline-checkbox admin-editor-frontmatter__author-avatar-toggle">
            <span>显示作者头像</span>
            <input type="checkbox" bind:checked={value.authorShowAvatar} {disabled} />
          </label>
        </div>
        <div class="admin-editor-frontmatter__author-avatar-layout" class:has-preview={essayAuthorPreviewItems.length > 0}>
          {#if essayAuthorPreviewItems.length > 0}
            <div class="admin-editor-frontmatter__author-preview" role="list" aria-label="作者显示预览">
              {#each essayAuthorPreviewItems as item (item.name)}
                <span class="admin-editor-frontmatter__author-preview-item" role="listitem" title={item.name}>
                  <span class="admin-editor-frontmatter__author-preview-avatar" aria-hidden="true">
                    {#if value.authorShowAvatar && item.previewSrc}
                      <img src={item.previewSrc} alt="" loading="lazy" decoding="async" />
                    {:else}
                      <span>{item.fallback}</span>
                    {/if}
                  </span>
                  <span class="admin-editor-frontmatter__author-preview-name">{item.name}</span>
                </span>
              {/each}
            </div>
          {/if}
          <p id={getFieldIssueId('authorAvatarsText')} class="admin-content-editor__error" hidden={!essayAuthorAvatarIssue}>{essayAuthorAvatarIssue}</p>
        </div>
      </div>

      <div class="admin-editor-frontmatter__datetime-grid">
        <div class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('translationTranslator'))}>
          <label class="admin-field__label" for="admin-essay-translator">译者</label>
          <div class="admin-editor-frontmatter__library-combo admin-editor-frontmatter__library-combo--inline">
            <input
              id="admin-essay-translator"
              class="admin-field__control admin-editor-frontmatter__library-search"
              name="translationTranslator"
              type="search"
              bind:value={value.translationTranslator}
              list={TRANSLATOR_LIBRARY_LIST_ID}
              aria-invalid={getIssue('translationTranslator') ? 'true' : undefined}
              aria-describedby={getFieldDescribedBy('translationTranslator')}
              oninput={() => {
                translatorSearchText = value.translationTranslator;
              }}
              onkeydown={handleTranslatorSearchKeydown}
              onchange={applyTranslatorFromCurrentValue}
              {disabled}
            />
            {#if authorLibraryOptions.length > 0}
              <button
                class="admin-btn admin-btn--secondary admin-btn--compact admin-btn--icon admin-editor-frontmatter__library-add"
                type="button"
                aria-label="套用译者"
                title="套用译者"
                disabled={disabled || !(translatorSearchText || value.translationTranslator).trim()}
                onclick={applyTranslatorSearch}
              >
                <AdminEditorIcon name="check-mark" size={15} strokeWidth={2} />
              </button>
              <datalist id={TRANSLATOR_LIBRARY_LIST_ID}>
                {#each authorLibraryOptions as profile (profile.name)}
                  <option value={profile.name}>{profile.avatar || profile.name}</option>
                {/each}
              </datalist>
            {/if}
          </div>
          <p id={getFieldIssueId('translationTranslator')} class="admin-content-editor__error" hidden={!getIssue('translationTranslator')}>{getIssue('translationTranslator')}</p>
        </div>

        <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('translationAvatar'))}>
          <span class="admin-field__label">译者头像</span>
          <input
            class="admin-field__control"
            name="translationAvatar"
            type="text"
            bind:value={value.translationAvatar}
            placeholder="author/avatar.webp"
            spellcheck="false"
            aria-invalid={getIssue('translationAvatar') ? 'true' : undefined}
            aria-describedby={getFieldDescribedBy('translationAvatar')}
            {disabled}
          />
          <p id={getFieldIssueId('translationAvatar')} class="admin-content-editor__error" hidden={!getIssue('translationAvatar')}>{getIssue('translationAvatar')}</p>
        </label>
      </div>

      <div class="admin-editor-frontmatter__datetime-grid">
        <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('translationSource'))}>
          <span class="admin-field__label">原文来源</span>
          <input
            class="admin-field__control"
            name="translationSource"
            type="text"
            bind:value={value.translationSource}
            aria-invalid={getIssue('translationSource') ? 'true' : undefined}
            aria-describedby={getFieldDescribedBy('translationSource')}
            {disabled}
          />
          <p id={getFieldIssueId('translationSource')} class="admin-content-editor__error" hidden={!getIssue('translationSource')}>{getIssue('translationSource')}</p>
        </label>

        <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('translationSourceUrl'))}>
          <span class="admin-field__label">原文链接</span>
          <input
            class="admin-field__control"
            name="translationSourceUrl"
            type="url"
            bind:value={value.translationSourceUrl}
            placeholder="https://example.com/original"
            spellcheck="false"
            aria-invalid={getIssue('translationSourceUrl') ? 'true' : undefined}
            aria-describedby={getFieldDescribedBy('translationSourceUrl')}
            {disabled}
          />
          <p id={getFieldIssueId('translationSourceUrl')} class="admin-content-editor__error" hidden={!getIssue('translationSourceUrl')}>{getIssue('translationSourceUrl')}</p>
        </label>
      </div>

      <label class="admin-editor-frontmatter__inline-checkbox admin-editor-frontmatter__translator-toggle">
        <span>显示译者头像</span>
        <input type="checkbox" bind:checked={value.translationShowAvatar} {disabled} />
      </label>

      <div class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('tags'))}>
        <label class="admin-field__label" for="admin-essay-tags">标签</label>
        <FrontmatterTagsInput
          id="admin-essay-tags"
          bind:value={value.tagsText}
          {disabled}
          invalid={Boolean(getIssue('tags'))}
          ariaDescribedby={getFieldDescribedBy('tags')}
          onDirty={onDirty}
        />
        <p id={getFieldIssueId('tags')} class="admin-content-editor__error" hidden={!getIssue('tags')}>{getIssue('tags')}</p>
      </div>
    {:else if collection === 'bits' && isBitsEditorValues(value)}
      <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('title'))}>
        <span class="admin-field__label">标题（可选）</span>
        <input
          class="admin-field__control"
          name="title"
          type="text"
          bind:value={value.title}
          aria-invalid={getIssue('title') ? 'true' : undefined}
          aria-describedby={getFieldDescribedBy('title')}
          oninput={onDirty}
          {disabled}
        />
        <p id={getFieldIssueId('title')} class="admin-content-editor__error" hidden={!getIssue('title')}>{getIssue('title')}</p>
      </label>

      {#if fieldScope !== 'bits-summary'}
        <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('date'))}>
          <span class="admin-field__label">发布时间</span>
          <input
            class="admin-field__control"
            name="date"
            type="text"
            bind:value={value.date}
            aria-invalid={getIssue('date') ? 'true' : undefined}
            aria-describedby={getFieldDescribedBy('date')}
            {disabled}
          />
          <p id={getFieldIssueId('date')} class="admin-content-editor__error" hidden={!getIssue('date')}>{getIssue('date')}</p>
        </label>
      {/if}

      {#if fieldScope !== 'bits-summary' || bitsAuthorIssue}
        <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('authorName'))}>
          <span class="admin-field__label">作者名（单条覆盖）</span>
          <input
            class="admin-field__control"
            name="authorName"
            type="text"
            bind:value={value.authorName}
            aria-invalid={getIssue('authorName') ? 'true' : undefined}
            aria-describedby={getFieldDescribedBy('authorName')}
            oninput={onDirty}
            {disabled}
          />
          <p id={getFieldIssueId('authorName')} class="admin-content-editor__error" hidden={!getIssue('authorName')}>{getIssue('authorName')}</p>
        </label>

        <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('authorAvatar'))}>
          <span class="admin-field__label">作者头像（单条覆盖）</span>
          <input
            class="admin-field__control"
            name="authorAvatar"
            type="text"
            bind:value={value.authorAvatar}
            placeholder="author/avatar.webp"
            spellcheck="false"
            aria-invalid={getIssue('authorAvatar') ? 'true' : undefined}
            aria-describedby={getFieldDescribedBy('authorAvatar')}
            oninput={onDirty}
            {disabled}
          />
          <p id={getFieldIssueId('authorAvatar')} class="admin-content-editor__error" hidden={!getIssue('authorAvatar')}>{getIssue('authorAvatar')}</p>
        </label>
      {/if}

      <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('description'))}>
        <span class="admin-field__label">摘要</span>
        <textarea
          class="admin-field__control"
          name="description"
          bind:value={value.description}
          rows="3"
          aria-invalid={getIssue('description') ? 'true' : undefined}
          aria-describedby={getFieldDescribedBy('description')}
          oninput={onDirty}
          {disabled}
        ></textarea>
        <p id={getFieldIssueId('description')} class="admin-content-editor__error" hidden={!getIssue('description')}>{getIssue('description')}</p>
      </label>

      {#if fieldScope === 'bits-summary' && !bitsAuthorIssue}
        <div class="admin-field admin-content-editor__field">
          <span class="admin-field__label">作者（只读）</span>
          <div class="admin-editor-frontmatter__readonly-author" role="group" aria-label="作者（只读）">
            <span class="admin-editor-frontmatter__readonly-author-avatar" aria-hidden="true">
              {#if bitsAuthorAvatarPreviewSrc}
                <img src={bitsAuthorAvatarPreviewSrc} alt="" loading="lazy" decoding="async" />
              {:else}
                <span>{bitsAuthorAvatarFallback}</span>
              {/if}
            </span>
            <div class="admin-editor-frontmatter__readonly-author-copy">
              <strong class="admin-editor-frontmatter__readonly-author-name">{bitsAuthorNameText}</strong>
              <code class="admin-editor-frontmatter__readonly-author-path" title={bitsAuthorAvatarText || '未设置'}>
                {bitsAuthorAvatarText || '未设置'}
              </code>
            </div>
          </div>
        </div>
      {/if}

      {#if fieldScope !== 'bits-summary'}
        <div class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('tags'))}>
          <label class="admin-field__label" for="admin-bits-tags">标签</label>
          <FrontmatterTagsInput
            id="admin-bits-tags"
            bind:value={value.tagsText}
            {disabled}
            invalid={Boolean(getIssue('tags'))}
            ariaDescribedby={getFieldDescribedBy('tags')}
            onDirty={onDirty}
          />
          <p id={getFieldIssueId('tags')} class="admin-content-editor__error" hidden={!getIssue('tags')}>{getIssue('tags')}</p>
        </div>

        <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(bitsImagesIssue)}>
          <span class="admin-field__label">图片 JSON</span>
          <textarea
            class="admin-field__control"
            name="imagesText"
            bind:value={value.imagesText}
            rows="8"
            spellcheck="false"
            aria-invalid={bitsImagesIssue ? 'true' : undefined}
            aria-describedby={getFieldDescribedBy('imagesText', bitsImagesIssue)}
            {disabled}
          ></textarea>
          <p id={getFieldIssueId('imagesText')} class="admin-content-editor__error" hidden={!bitsImagesIssue}>{bitsImagesIssue}</p>
        </label>
      {/if}
    {/if}
  </div>
</aside>

