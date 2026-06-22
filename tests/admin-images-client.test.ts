import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteImages, fetchList } from '../src/scripts/admin-images/data';
import {
  parseAdminImageListResponse,
  parseAdminImageMetaResponse
} from '../src/scripts/admin-shared/image-client';
import {
  DEFAULT_GROUP,
  type AdminImageListItem,
  type AdminImageState
} from '../src/scripts/admin-images/types';

const listItem: AdminImageListItem = {
  path: 'public/images/archive/cover.png',
  origin: 'public',
  fileName: 'cover.png',
  owner: null,
  ownerLabel: null,
  browseGroup: 'pages',
  browseGroupLabel: '页面插图',
  browseSubgroup: 'archive',
  browseSubgroupLabel: '归档',
  preferredValue: '/images/archive/cover.png',
  previewSrc: '/images/archive/cover.png',
  value: '/images/archive/cover.png',
  width: 1200,
  height: 800,
  size: 2048,
  mimeType: 'image/png'
};

const createState = (state: Partial<AdminImageState> = {}): AdminImageState => ({
  scope: '',
  group: DEFAULT_GROUP,
  subgroup: '',
  query: '',
  page: 1,
  ...state
});

const createListPayload = () => ({
  ok: true,
  result: {
    scope: 'recent',
    group: '',
    subgroup: '',
    groupOptions: [],
    subgroupOptions: [],
    items: [listItem] as unknown[],
    page: 1,
    totalPages: 1,
    totalCount: 1
  }
});

const mockListFetch = (payload: unknown) => {
  const requestedUrls: string[] = [];
  const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    requestedUrls.push(String(input));
    return Response.json(payload);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, requestedUrls };
};

describe('admin-images/data', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends recent scope and accepts a matching response contract', async () => {
    const { fetchMock, requestedUrls } = mockListFetch(createListPayload());

    const result = await fetchList(
      '/api/admin/images/list',
      createState({ scope: 'recent', query: 'cover', page: 2 }),
      20
    );

    expect(result.scope).toBe('recent');
    expect(fetchMock).toHaveBeenCalledOnce();
    const requestUrl = new URL(requestedUrls[0] ?? '', 'http://127.0.0.1');
    expect(requestUrl.searchParams.get('scope')).toBe('recent');
    expect(requestUrl.searchParams.get('group')).toBeNull();
    expect(requestUrl.searchParams.get('q')).toBe('cover');
    expect(requestUrl.searchParams.get('page')).toBe('2');
  });

  it('accepts the shared field picker list and metadata contracts', () => {
    const listResult = parseAdminImageListResponse(createListPayload());
    const metaResult = parseAdminImageMetaResponse({
      ok: true,
      result: {
        kind: 'local',
        path: listItem.path,
        value: listItem.value,
        origin: listItem.origin,
        width: listItem.width,
        height: listItem.height,
        size: listItem.size,
        mimeType: listItem.mimeType,
        previewSrc: listItem.previewSrc
      }
    });

    expect(listResult.items).toHaveLength(1);
    expect(listResult.page).toBe(1);
    expect(metaResult.path).toBe(listItem.path);
  });

  it('rejects malformed Images Console list items instead of hiding them', async () => {
    const payload = createListPayload();
    payload.result.items = [
      {
        ...listItem,
        value: 404
      }
    ];
    mockListFetch(payload);

    await expect(fetchList('/api/admin/images/list', createState({ scope: 'recent' }), 20))
      .rejects.toThrow('图片列表响应格式无效');
  });

  it('rejects missing pagination fields from Images Console list responses', async () => {
    const payload = createListPayload();
    delete (payload.result as Record<string, unknown>).totalPages;
    mockListFetch(payload);

    await expect(fetchList('/api/admin/images/list', createState({ scope: 'recent' }), 20))
      .rejects.toThrow('图片列表响应格式无效');
  });

  it('rejects malformed Images Console filter options', async () => {
    const payload = createListPayload();
    payload.result.groupOptions = [
      {
        value: DEFAULT_GROUP,
        label: '全部',
        count: '1'
      }
    ] as unknown as typeof payload.result.groupOptions;
    mockListFetch(payload);

    await expect(fetchList('/api/admin/images/list', createState({ scope: 'recent' }), 20))
      .rejects.toThrow('图片列表响应格式无效');
  });

  it('sends delete requests as JSON and parses per-path results', async () => {
    const requested: { url: string; method: string | undefined; body: string }[] = [];
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      requested.push({
        url: String(input),
        method: init?.method,
        body: typeof init?.body === 'string' ? init.body : ''
      });
      return Response.json({
        ok: true,
        result: {
          deleted: ['public/images/archive/cover.png'],
          failed: [{ path: 'public/favicon.png', error: '系统保留图片不允许从 Images Console 删除' }]
        }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await deleteImages('/api/admin/images/delete/', [
      'public/images/archive/cover.png',
      'public/favicon.png'
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(requested[0]?.url).toBe('/api/admin/images/delete/');
    expect(requested[0]?.method).toBe('POST');
    expect(JSON.parse(requested[0]?.body ?? '{}')).toEqual({
      paths: ['public/images/archive/cover.png', 'public/favicon.png']
    });
    expect(result.deleted).toEqual(['public/images/archive/cover.png']);
    expect(result.failed[0]?.path).toBe('public/favicon.png');
  });
  it('rejects malformed shared picker list and metadata responses', () => {
    expect(() => parseAdminImageListResponse({
      ...createListPayload(),
      result: {
        ...createListPayload().result,
        items: [
          {
            ...listItem,
            origin: 'remote'
          }
        ]
      }
    })).toThrow('图片列表响应格式无效');

    expect(() => parseAdminImageMetaResponse({
      ok: true,
      result: {
        kind: 'local',
        path: listItem.path,
        value: listItem.value,
        origin: listItem.origin,
        width: String(listItem.width),
        height: listItem.height,
        size: listItem.size,
        mimeType: listItem.mimeType,
        previewSrc: listItem.previewSrc
      }
    })).toThrow('图片元数据响应格式无效');
  });
});
