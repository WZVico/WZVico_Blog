import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preview } from 'astro';
import {
  assertAdminContentStaticResponse,
  assertAdminImageStaticResponse,
  assertAdminOverviewHeader,
  assertNoAdminRouteNav,
  assertAdminSettingsStaticResponse,
  assertStaticUnsupportedApiShell,
  expect,
  findAvailablePort,
  sleep,
  waitForHttpReady
} from './smoke-utils.mjs';

const projectRoot = path.resolve('.');
const astroCliPath = path.join(projectRoot, 'node_modules', 'astro', 'bin', 'astro.mjs');
const defaultSettingsDir = path.join(projectRoot, 'src', 'data', 'settings');
const previewHost = '127.0.0.1';
const ADMIN_BOOTSTRAP_XSS_SENTINEL = '__ADMIN_BOOTSTRAP_XSS_SENTINEL__';
const ADMIN_BOOTSTRAP_BREAKOUT_PAYLOAD = `</script><script>window.${ADMIN_BOOTSTRAP_XSS_SENTINEL}=1</script>`;

const getRequestedPort = (envName, fallbackPort) => {
  const parsed = Number(process.env[envName] ?? String(fallbackPort));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallbackPort;
};

const request = async (baseUrl, pathname, init = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const bodyText = await response.text();
  let bodyJson = null;
  try {
    bodyJson = JSON.parse(bodyText);
  } catch {}

  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    body: bodyText,
    json: bodyJson
  };
};

const waitForJsonApiReady = async (baseUrl, pathname, options = {}) => {
  const { attempts = 40, intervalMs = 250 } = options;
  let lastResponse = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await request(baseUrl, pathname);
      lastResponse = response;
      if (response.status === 200 && response.contentType.toLowerCase().includes('application/json')) {
        return response;
      }
    } catch {}

    if (attempt < attempts - 1) {
      await sleep(intervalMs);
    }
  }

  const detail = lastResponse
    ? `last status=${lastResponse.status}, content-type=${lastResponse.contentType}`
    : 'no response received';
  throw new Error(`Timed out waiting for JSON API ${pathname}: ${detail}`);
};

const resolvePreviewPort = (server, fallbackPort) => {
  const address = server?.server?.address?.();
  return address && typeof address === 'object' ? address.port : fallbackPort;
};

const createTempSettingsFixture = async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'astro-whono-admin-settings-'));
  const settingsDir = path.join(tempRoot, 'settings');
  await cp(defaultSettingsDir, settingsDir, { recursive: true });
  return {
    tempRoot,
    settingsDir,
    cleanup: () => rm(tempRoot, { recursive: true, force: true })
  };
};

const createJsonRequestInit = (baseUrl, payload) => ({
  method: 'POST',
  headers: {
    accept: 'application/json',
    'content-type': 'application/json',
    origin: baseUrl
  },
  body: JSON.stringify(payload)
});

const assertAdminOverviewShell = (label, response, options = {}) => {
  const { expectMaintainerView = false } = options;
  expect(response.status === 200, `${label} returned ${response.status}`);
  expect(
    response.contentType.toLowerCase().includes('text/html'),
    `${label} did not return HTML`
  );
  assertAdminOverviewHeader(label, response.body);
  expect(!response.body.includes('data-admin-root'), `${label} should not mount the theme form root`);
  expect(!response.body.includes('id="admin-bootstrap"'), `${label} should not emit theme bootstrap payload`);
  expect(!response.body.includes('data-admin-content-root'), `${label} should not emit content console payload`);
  expect(!response.body.includes('data-admin-images-root'), `${label} should not emit images console payload`);
  expect(!response.body.includes('id="admin-images-bootstrap"'), `${label} should not emit images bootstrap payload`);
  expect(!response.body.includes('data-admin-data-root'), `${label} should not emit data console payload`);
  expect(!response.body.includes('id="admin-data-bootstrap"'), `${label} should not emit data bootstrap payload`);

  if (expectMaintainerView) {
    assertNoAdminRouteNav(label, response.body);
    expect(
      response.body.includes('data-admin-overview-mode="maintainer"'),
      `${label} is missing the maintainer overview mode marker`
    );
  } else {
    assertNoAdminRouteNav(label, response.body);
    expect(
      response.body.includes('data-admin-overview-mode="public"')
        || response.body.includes('data-admin-overview-mode="hidden"'),
      `${label} is missing the public or hidden overview mode marker`
    );
  }
};

const assertReadonlyAdminThemeShell = (label, response) => {
  expect(response.status === 200, `${label} returned ${response.status}`);
  expect(
    response.contentType.toLowerCase().includes('text/html'),
    `${label} did not return HTML`
  );
  expect(response.body.includes('Theme Console'), `${label} is missing the Theme Console route heading`);
  assertNoAdminRouteNav(label, response.body);
  expect(!response.body.includes('data-admin-root'), `${label} should stay readonly outside dev`);
  expect(!response.body.includes('id="admin-bootstrap"'), `${label} should not emit theme bootstrap payload outside dev`);
};

const assertReadonlyAdminDataShell = (label, response) => {
  expect(response.status === 200, `${label} returned ${response.status}`);
  expect(
    response.contentType.toLowerCase().includes('text/html'),
    `${label} did not return HTML`
  );
  expect(response.body.includes('Data Console'), `${label} is missing the Data Console route heading`);
  assertNoAdminRouteNav(label, response.body);
  expect(!response.body.includes('data-admin-data-root'), `${label} should stay readonly outside dev`);
  expect(!response.body.includes('id="admin-data-bootstrap"'), `${label} should not emit data bootstrap payload outside dev`);
};

const assertReadonlyAdminChecksShell = (label, response) => {
  expect(response.status === 200, `${label} returned ${response.status}`);
  expect(
    response.contentType.toLowerCase().includes('text/html'),
    `${label} did not return HTML`
  );
  expect(response.body.includes('Checks Console'), `${label} is missing the Checks Console route heading`);
  assertNoAdminRouteNav(label, response.body);
};

const assertAdminCategoryShell = (label, response, options = {}) => {
  const { expectBitsDraft = false, expectMaterialsCreate = false, expectCategoryTabs = false } = options;
  expect(response.status === 200, `${label} returned ${response.status}`);
  expect(
    response.contentType.toLowerCase().includes('text/html'),
    `${label} did not return HTML`
  );
  expect(response.body.includes('Category Console'), `${label} is missing the Category Console route heading`);
  expect(response.body.includes('分类管理'), `${label} is missing the Category Console subtitle`);
  if (expectBitsDraft) {
    expect(!response.body.includes('data-admin-bits-draft-open'), `${label} should not render the old bits draft opener`);
    expect(response.body.includes('id="bits-draft-dialog"'), `${label} is missing the bits draft dialog`);
    expect(response.body.includes('data-bits-draft-inline="true"'), `${label} is missing the inline bits draft marker`);
    expect(
      response.body.includes('data-bits-draft-create-endpoint="/api/admin/category/bits/"'),
      `${label} is missing the bits draft create endpoint`
    );
    expect(response.body.includes('data-bits-draft-form'), `${label} is missing the inline bits draft form`);
    expect(response.body.includes('data-bits-draft-generate'), `${label} is missing the generate action`);
    expect(!response.body.includes('data-bits-draft-download'), `${label} should not render the old download action`);
  }
  if (expectMaterialsCreate) {
    expect(response.body.includes('data-materials-create-root'), `${label} is missing the materials create root`);
    expect(
      response.body.includes('data-materials-create-endpoint="/api/admin/category/materials/"'),
      `${label} is missing the materials create endpoint`
    );
    expect(response.body.includes('data-material-field="title"'), `${label} is missing materials title field`);
    expect(response.body.includes('data-material-field="href"'), `${label} is missing materials href field`);
    expect(!response.body.includes('data-material-field="date"'), `${label} should not expose a manual materials date field`);
    expect(!response.body.includes('data-material-field="group"'), `${label} should not expose a materials group field`);
    expect(!response.body.includes('data-material-field="slug"'), `${label} should not expose a materials slug field`);
    expect(!response.body.includes('data-materials-create-add'), `${label} should not expose bulk add rows`);
    expect(response.body.includes('data-materials-create-submit'), `${label} is missing materials submit action`);
  }
  assertNoAdminRouteNav(label, response.body);
  if (expectCategoryTabs) {
    expect(response.body.includes('admin-category-tabs'), `${label} is missing the category tabs`);
    expect(response.body.includes('长文'), `${label} is missing the default longform tab`);
  }
};

const assertBitsPageWithoutDraftTools = (label, response) => {
  expect(response.status === 200, `${label} returned ${response.status}`);
  expect(
    response.contentType.toLowerCase().includes('text/html'),
    `${label} did not return HTML`
  );
  expect(!response.body.includes('data-new-bit'), `${label} should not expose the bits draft opener`);
  expect(!response.body.includes('id="bits-draft-dialog"'), `${label} should not render the bits draft dialog`);
  expect(!response.body.includes('bits/draft-dialog/'), `${label} should not reference the old bits draft fragment`);
};

const assertAdminBitsCreateStaticResponse = (label, response) => {
  expect(
    !response.contentType.toLowerCase().includes('application/json'),
    `${label} unexpectedly returned JSON in production preview`
  );
  assertStaticUnsupportedApiShell(label, response.body, '/api/admin/category/bits/');
};

const assertAdminMaterialsCreateStaticResponse = (label, response) => {
  expect(
    !response.contentType.toLowerCase().includes('application/json'),
    `${label} unexpectedly returned JSON in production preview`
  );
  assertStaticUnsupportedApiShell(label, response.body, '/api/admin/category/materials/');
};

const assertReadonlyAdminImageShell = (label, response) => {
  expect(response.status === 200, `${label} returned ${response.status}`);
  expect(
    response.contentType.toLowerCase().includes('text/html'),
    `${label} did not return HTML`
  );
  expect(response.body.includes('Images Console'), `${label} is missing the Images Console route heading`);
  assertNoAdminRouteNav(label, response.body);
  expect(!response.body.includes('data-admin-images-root'), `${label} should stay readonly outside dev`);
  expect(!response.body.includes('id="admin-images-bootstrap"'), `${label} should not emit images bootstrap payload outside dev`);
};

const assertReadonlyAdminContentShell = (label, response) => {
  expect(response.status === 200, `${label} returned ${response.status}`);
  expect(
    response.contentType.toLowerCase().includes('text/html'),
    `${label} did not return HTML`
  );
  expect(response.body.includes('Content Console'), `${label} is missing the Content Console route heading`);
  expect(
    response.body.includes('若需查看或编辑内容索引'),
    `${label} is missing the Content Console local-development notice`
  );
  assertNoAdminRouteNav(label, response.body);
  expect(!response.body.includes('data-admin-content-root'), `${label} should stay readonly outside dev`);
};

const assertDevAdminContentConsoleShell = (label, response, options = {}) => {
  const { expectAuthorLibrary = false } = options;
  expect(response.status === 200, `${label} returned ${response.status}`);
  expect(
    response.contentType.toLowerCase().includes('text/html'),
    `${label} did not return HTML`
  );
  expect(response.body.includes('Content Console'), `${label} is missing the Content Console route heading`);
  expect(response.body.includes('data-admin-content-root'), `${label} is missing the Content Console root`);
  expect(response.body.includes('内容管理'), `${label} is missing the Content Console toolbar heading`);
  expect(
    !response.body.includes('若需查看或编辑内容索引'),
    `${label} should render the editable Content Console in dev`
  );
  if (expectAuthorLibrary) {
    expect(response.body.includes('data-author-content-root'), `${label} is missing the author module root`);
    expect(response.body.includes('作者'), `${label} is missing the author module heading`);
    expect(
      response.body.includes('data-author-content-endpoint="/api/admin/content/authors/"'),
      `${label} is missing the Content Console author endpoint`
    );
  } else {
    expect(!response.body.includes('data-author-content-root'), `${label} should not render the author module outside overview`);
  }
  assertNoAdminRouteNav(label, response.body);
};

const assertAdminThemeDevBootstrapSafe = (label, response) => {
  expect(response.status === 200, `${label} returned ${response.status}`);
  expect(
    response.contentType.toLowerCase().includes('text/html'),
    `${label} did not return HTML`
  );
  expect(response.body.includes('data-admin-root'), `${label} lost the admin console shell`);
  assertNoAdminRouteNav(label, response.body);
  expect(response.body.includes('id="admin-bootstrap"'), `${label} is missing the bootstrap container`);
  expect(
    response.body.includes(ADMIN_BOOTSTRAP_XSS_SENTINEL),
    `${label} did not include the stored sentinel in bootstrap output`
  );
  expect(
    !response.body.includes(ADMIN_BOOTSTRAP_BREAKOUT_PAYLOAD),
    `${label} bootstrap still emits raw </script> breakout payload`
  );
  expect(
    !response.body.includes(`<script>window.${ADMIN_BOOTSTRAP_XSS_SENTINEL}=1</script>`),
    `${label} bootstrap still emits an executable sentinel script tag`
  );
};

const stopProcess = async (child) => {
  if (!child || child.exitCode !== null) return;

  child.kill('SIGTERM');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (child.exitCode !== null) return;
    await sleep(100);
  }

  child.kill('SIGKILL');
};

export const runPreviewAdminBoundaryCheck = async () => {
  const requestedPort = getRequestedPort('CI_PREVIEW_PORT', 4323);
  const availablePort = await findAvailablePort(previewHost, requestedPort);
  if (availablePort !== requestedPort) {
    console.warn(
      `[check:preview-admin] Port ${requestedPort} is unavailable; using ${availablePort} instead.`
    );
  }

  const server = await preview({
    server: {
      host: previewHost,
      port: availablePort
    }
  });

  const previewPort = resolvePreviewPort(server, availablePort);
  const baseUrl = `http://${previewHost}:${previewPort}`;

  try {
    await waitForHttpReady(`${baseUrl}/`);

    const adminOverviewResponse = await request(baseUrl, '/admin/');
    const adminThemeResponse = await request(baseUrl, '/admin/theme/');
    const adminContentResponse = await request(baseUrl, '/admin/content/');
    const adminLongformContentResponse = await request(baseUrl, '/admin/content/?collection=longform');
    const adminCategoryResponse = await request(baseUrl, '/admin/category/');
    const bitsResponse = await request(baseUrl, '/bits/');
    const adminImageResponse = await request(baseUrl, '/admin/images/');
    const adminChecksResponse = await request(baseUrl, '/admin/checks/');
    const adminDataResponse = await request(baseUrl, '/admin/data/');
    const getResponse = await request(baseUrl, '/api/admin/settings/');
    const exportResponse = await request(baseUrl, '/api/admin/data/settings/');
    const contentGetResponse = await request(baseUrl, '/api/admin/content/entry/');
    const contentCreateGetResponse = await request(baseUrl, '/api/admin/content/create/');
    const contentDeleteGetResponse = await request(baseUrl, '/api/admin/content/delete/');
    const contentExportGetResponse = await request(baseUrl, '/api/admin/content/export/');
    const contentBulkStatusGetResponse = await request(baseUrl, '/api/admin/content/bulk-status/');
    const contentBulkDeleteGetResponse = await request(baseUrl, '/api/admin/content/bulk-delete/');
    const contentBulkExportGetResponse = await request(baseUrl, '/api/admin/content/bulk-export/');
    const contentAuthorsGetResponse = await request(baseUrl, '/api/admin/content/authors/');
    const contentPreviewGetResponse = await request(baseUrl, '/api/admin/preview/');
    const bitsCreateGetResponse = await request(baseUrl, '/api/admin/category/bits/');
    const materialsCreateGetResponse = await request(baseUrl, '/api/admin/category/materials/');
    const imageListResponse = await request(baseUrl, '/api/admin/images/list/');
    const imageMetaResponse = await request(baseUrl, '/api/admin/images/meta/');
    const imageUploadResponse = await request(baseUrl, '/api/admin/images/upload/');
    const contentPostResponse = await request(baseUrl, '/api/admin/content/entry/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseUrl
      },
      body: JSON.stringify({
        collection: 'longform',
        entryId: 'preview-boundary-demo',
        revision: 'invalid',
        frontmatter: {}
      })
    });
    const bitsCreatePostResponse = await request(baseUrl, '/api/admin/category/bits/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseUrl
      },
      body: JSON.stringify({
        markdown: '---\ndate: 2026-01-01T00:00:00+08:00\n---\n\npreview boundary'
      })
    });
    const materialsCreatePostResponse = await request(baseUrl, '/api/admin/category/materials/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseUrl
      },
      body: JSON.stringify({
        item: {
          title: 'Preview boundary material',
          href: 'https://example.com/material'
        }
      })
    });
    const postResponse = await request(baseUrl, '/api/admin/settings/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: baseUrl
      },
      body: JSON.stringify({ revision: 'invalid', settings: {} })
    });

    assertAdminOverviewShell('Preview GET /admin/', adminOverviewResponse);
    assertReadonlyAdminThemeShell('Preview GET /admin/theme/', adminThemeResponse);
    assertReadonlyAdminContentShell('Preview GET /admin/content/', adminContentResponse);
    assertReadonlyAdminContentShell('Preview GET /admin/content/?collection=longform', adminLongformContentResponse);
    assertAdminCategoryShell('Preview GET /admin/category/', adminCategoryResponse);
    assertBitsPageWithoutDraftTools('Preview GET /bits/', bitsResponse);
    assertReadonlyAdminImageShell('Preview GET /admin/images/', adminImageResponse);
    assertReadonlyAdminChecksShell('Preview GET /admin/checks/', adminChecksResponse);
    assertReadonlyAdminDataShell('Preview GET /admin/data/', adminDataResponse);
    assertAdminSettingsStaticResponse('GET /api/admin/settings/', getResponse);
    assertAdminSettingsStaticResponse('GET /api/admin/data/settings/', exportResponse, '/api/admin/data/settings/');
    assertAdminContentStaticResponse('GET /api/admin/content/entry/', contentGetResponse);
    assertAdminContentStaticResponse('GET /api/admin/content/create/', contentCreateGetResponse, '/api/admin/content/create/');
    assertAdminContentStaticResponse('GET /api/admin/content/delete/', contentDeleteGetResponse, '/api/admin/content/delete/');
    assertAdminContentStaticResponse('GET /api/admin/content/export/', contentExportGetResponse, '/api/admin/content/export/');
    assertAdminContentStaticResponse('GET /api/admin/content/bulk-status/', contentBulkStatusGetResponse, '/api/admin/content/bulk-status/');
    assertAdminContentStaticResponse('GET /api/admin/content/bulk-delete/', contentBulkDeleteGetResponse, '/api/admin/content/bulk-delete/');
    assertAdminContentStaticResponse('GET /api/admin/content/bulk-export/', contentBulkExportGetResponse, '/api/admin/content/bulk-export/');
    assertAdminContentStaticResponse('GET /api/admin/content/authors/', contentAuthorsGetResponse, '/api/admin/content/authors/');
    assertAdminContentStaticResponse('GET /api/admin/preview/', contentPreviewGetResponse, '/api/admin/preview/');
    assertAdminBitsCreateStaticResponse('GET /api/admin/category/bits/', bitsCreateGetResponse);
    assertAdminMaterialsCreateStaticResponse('GET /api/admin/category/materials/', materialsCreateGetResponse);
    assertAdminImageStaticResponse('GET /api/admin/images/list/', imageListResponse, '/api/admin/images/list/');
    assertAdminImageStaticResponse('GET /api/admin/images/meta/', imageMetaResponse, '/api/admin/images/meta/');
    assertAdminImageStaticResponse('GET /api/admin/images/upload/', imageUploadResponse, '/api/admin/images/upload/');
    assertAdminContentStaticResponse('POST /api/admin/content/entry/', contentPostResponse);
    assertAdminBitsCreateStaticResponse('POST /api/admin/category/bits/', bitsCreatePostResponse);
    assertAdminMaterialsCreateStaticResponse('POST /api/admin/category/materials/', materialsCreatePostResponse);
    assertAdminSettingsStaticResponse('POST /api/admin/settings/', postResponse);
    console.log('Preview admin boundary check passed.');
  } finally {
    await server.stop();
  }
};

export const runDevAdminSettingsSmokeCheck = async () => {
  const fixture = await createTempSettingsFixture();
  const requestedPort = getRequestedPort('CI_DEV_ADMIN_PORT', 4324);
  const availablePort = await findAvailablePort(previewHost, requestedPort);
  const baseUrl = `http://${previewHost}:${availablePort}`;
  let stdout = '';
  let stderr = '';
  const child = spawn(process.execPath, [astroCliPath, 'dev', '--host', previewHost, '--port', String(availablePort)], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      ASTRO_WHONO_INTERNAL_TEST_SETTINGS: '1',
      ASTRO_WHONO_INTERNAL_TEST_SETTINGS_DIR: fixture.settingsDir
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  try {
    await waitForHttpReady(`${baseUrl}/`, { attempts: 75, intervalMs: 200 });

    const getResponse = await waitForJsonApiReady(baseUrl, '/api/admin/settings/');
    expect(getResponse.status === 200, `Dev GET /api/admin/settings/ returned ${getResponse.status}`);
    expect(
      getResponse.contentType.toLowerCase().includes('application/json'),
      'Dev GET /api/admin/settings/ did not return JSON'
    );
    expect(getResponse.json?.ok === true, 'Dev GET /api/admin/settings/ did not return editable payload');

    const payload = getResponse.json?.payload;
    expect(payload && typeof payload === 'object', 'Dev GET /api/admin/settings/ payload is missing');
    expect(typeof payload.revision === 'string' && payload.revision.length > 0, 'Dev payload revision is missing');
    expect(payload.settings && typeof payload.settings === 'object', 'Dev payload settings snapshot is missing');

    const contentOverviewResponse = await request(baseUrl, '/admin/content/');
    const contentLongformResponse = await request(baseUrl, '/admin/content/?collection=longform');
    const categoryResponse = await request(baseUrl, '/admin/category/');
    const categoryBitsResponse = await request(baseUrl, '/admin/category/?tab=bits');
    const categoryMaterialsResponse = await request(baseUrl, '/admin/category/?tab=materials');
    const bitsResponse = await request(baseUrl, '/bits/');
    assertDevAdminContentConsoleShell('Dev GET /admin/content/', contentOverviewResponse, {
      expectAuthorLibrary: true
    });
    assertDevAdminContentConsoleShell('Dev GET /admin/content/?collection=longform', contentLongformResponse);
    assertAdminCategoryShell('Dev GET /admin/category/', categoryResponse, { expectCategoryTabs: true });
    assertAdminCategoryShell('Dev GET /admin/category/?tab=bits', categoryBitsResponse, {
      expectBitsDraft: true,
      expectCategoryTabs: true
    });
    assertAdminCategoryShell('Dev GET /admin/category/?tab=materials', categoryMaterialsResponse, {
      expectMaterialsCreate: true,
      expectCategoryTabs: true
    });
    assertBitsPageWithoutDraftTools('Dev GET /bits/', bitsResponse);

    const uiSettingsPath = path.join(fixture.settingsDir, 'ui.json');
    const beforeDryRun = await readFile(uiSettingsPath, 'utf8');
    const dryRunSettings = structuredClone(payload.settings);
    dryRunSettings.ui.readingMode.showEntry = !dryRunSettings.ui.readingMode.showEntry;
    dryRunSettings.page.about.subtitle = ADMIN_BOOTSTRAP_BREAKOUT_PAYLOAD;

    const dryRunResponse = await request(
      baseUrl,
      '/api/admin/settings/?dryRun=1',
      createJsonRequestInit(baseUrl, {
        revision: payload.revision,
        settings: dryRunSettings
      })
    );

    expect(dryRunResponse.status === 200, `Dev POST ?dryRun=1 returned ${dryRunResponse.status}`);
    expect(dryRunResponse.json?.ok === true, 'Dev POST ?dryRun=1 did not succeed');
    expect(dryRunResponse.json?.dryRun === true, 'Dev POST ?dryRun=1 did not mark dryRun=true');
    expect(dryRunResponse.json?.results?.ui?.changed === true, 'Dev POST ?dryRun=1 did not detect ui changes');

    const afterDryRun = await readFile(uiSettingsPath, 'utf8');
    expect(afterDryRun === beforeDryRun, 'Dev POST ?dryRun=1 unexpectedly mutated ui.json');

    const saveResponse = await request(
      baseUrl,
      '/api/admin/settings/',
      createJsonRequestInit(baseUrl, {
        revision: payload.revision,
        settings: dryRunSettings
      })
    );

    expect(saveResponse.status === 200, `Dev POST /api/admin/settings/ returned ${saveResponse.status}`);
    expect(saveResponse.json?.ok === true, 'Dev POST /api/admin/settings/ did not succeed');
    expect(saveResponse.json?.results?.ui?.changed === true, 'Dev POST /api/admin/settings/ did not report ui change');
    expect(saveResponse.json?.results?.ui?.written === true, 'Dev POST /api/admin/settings/ did not write ui.json');
    expect(
      saveResponse.json?.payload?.settings?.ui?.readingMode?.showEntry === dryRunSettings.ui.readingMode.showEntry,
      'Dev POST /api/admin/settings/ did not return updated payload'
    );
    expect(
      saveResponse.json?.payload?.settings?.page?.about?.subtitle === ADMIN_BOOTSTRAP_BREAKOUT_PAYLOAD,
      'Dev POST /api/admin/settings/ did not persist the bootstrap regression payload'
    );

    const afterSave = await readFile(uiSettingsPath, 'utf8');
    expect(afterSave !== beforeDryRun, 'Dev POST /api/admin/settings/ did not update ui.json');
    expect(
      afterSave.includes(`"showEntry": ${dryRunSettings.ui.readingMode.showEntry}`),
      'Dev POST /api/admin/settings/ wrote unexpected ui.json content'
    );

    const adminOverviewResponse = await request(baseUrl, '/admin/');
    const adminThemeResponse = await request(baseUrl, '/admin/theme/');
    assertAdminOverviewShell('Dev GET /admin/', adminOverviewResponse, {
      expectMaintainerView: true
    });
    assertAdminThemeDevBootstrapSafe('Dev GET /admin/theme/', adminThemeResponse);

    console.log('Dev admin settings smoke check passed.');
  } catch (error) {
    const logs = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    if (logs) {
      console.error(logs);
    }
    throw error;
  } finally {
    await stopProcess(child);
    await fixture.cleanup();
  }
};

export const runAdminBoundaryChecks = async () => {
  await runPreviewAdminBoundaryCheck();
  await runDevAdminSettingsSmokeCheck();
};

const isDirectExecution = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isDirectExecution) {
  try {
    await runAdminBoundaryChecks();
  } catch (error) {
    console.error(error instanceof Error && error.stack ? error.stack : error);
    process.exit(1);
  }
}