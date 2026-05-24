import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type AboutGuideItem = {
  title: string;
  href: string;
  description: string;
};

export type AboutTechItem = {
  title: string;
  description: string;
};

export type AboutTechGroup = {
  title: string;
  items: AboutTechItem[];
};

export type AboutFaqItem = {
  question: string;
  answer: string;
};

export type AboutContent = {
  introLines: string[];
  guide: {
    title: string;
    items: AboutGuideItem[];
  };
  tech: {
    title: string;
    groups: AboutTechGroup[];
  };
  faq: {
    title: string;
    items: AboutFaqItem[];
  };
  contact: {
    title: string;
    note: string;
  };
};

export const ABOUT_CONTENT_RELATIVE_PATH = 'src/data/about.json';

export const DEFAULT_ABOUT_CONTENT: AboutContent = {
  introLines: [
    "WZVico' Blog 基于 Astro 主题 [Whono by cxro](https://github.com/cxro/astro-whono) 搭建。",
    '利用 Codex 进行编辑修改，满足个人记录、分享、管理、发布、部署的需求。'
  ],
  guide: {
    title: '栏目指引',
    items: [
      { title: '长文', href: '/longform/', description: '长篇原创、翻译、系列文章。' },
      { title: '絮语', href: '/bits/', description: '记录零散的想法、片段、即时感。' },
      { title: '拾选', href: '/picks/', description: '分享书单、影视、音乐等。' },
      { title: '归档', href: '/archive/', description: '按年份分组的归档目录。' },
      { title: '资料', href: '/Materials/', description: '视频与文件资料索引。' }
    ]
  },
  tech: {
    title: '技术栈',
    groups: [
      {
        title: '构建与渲染',
        items: [
          { title: 'Astro / Vite', description: '内容站点与构建' },
          { title: 'CSS / 排版', description: '排版与阅读体验' }
        ]
      },
      {
        title: '语言与工具',
        items: [
          { title: 'TypeScript', description: '类型约束与脚本支持' },
          { title: 'Markdown', description: '内容写作与发布流程' }
        ]
      }
    ]
  },
  faq: {
    title: '常见问题',
    items: [
      {
        question: '为什么我部署后会看到 SITE_URL is not set 警告？',
        answer:
          '因为没配置生产域名。未设置时会用占位域名，canonical / og:url / sitemap / robots 会不完整。部署平台里环境变量中添加 SITE_URL=https://你的域名，重新构建即可。'
      },
      {
        question: '为什么有的文章没出现在归档里？',
        answer:
          '归档会过滤掉 archive: false 的文章。它们仍然是“已发布可访问”的，但不会出现在归档列表与归档 RSS 中（用于少数不想被目录收录的内容）。'
      },
      {
        question: '为什么我在 /longform/ 点开文章会跳到 /archive/.../？',
        answer:
          '项目把文章详情统一在 /archive/{slug}/，/longform/ 主要作为文章流列表入口，这样可以避免重复详情路由，便于长期维护。'
      },
      {
        question: '如何反馈问题或参与改进？',
        answer:
          '直接在仓库创建 Issue，或提交 Pull Request。'
      }
    ]
  },
  contact: {
    title: '联系与订阅',
    note: '如果你有问题、建议，或想订阅更新，可以通过以下方式联系。'
  }
};

const ABOUT_CONTENT_PATH = join(process.cwd(), ABOUT_CONTENT_RELATIVE_PATH);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cloneAboutContent = (content: AboutContent): AboutContent =>
  JSON.parse(JSON.stringify(content)) as AboutContent;

const normalizeMultiline = (value: unknown, fallback: string): string => {
  const normalized = String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  return normalized || fallback;
};

const normalizeSingleLine = (value: unknown, fallback: string): string => {
  const normalized = normalizeMultiline(value, fallback).replace(/\n+/g, ' ').trim();
  return normalized || fallback;
};

const normalizeIntroLines = (value: unknown, fallback: readonly string[]): string[] => {
  const rawLines = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split('\n')
      : fallback;
  const lines = rawLines
    .map((line) => String(line ?? '').trim())
    .filter((line) => line.length > 0);
  return lines.length ? lines : [...fallback];
};

const normalizeGuideItems = (value: unknown, fallback: readonly AboutGuideItem[]): AboutGuideItem[] => {
  const rawItems = Array.isArray(value) ? value : [];
  return fallback.map((fallbackItem, index) => {
    const rawItem = isRecord(rawItems[index]) ? rawItems[index] : {};
    return {
      title: normalizeSingleLine(rawItem.title, fallbackItem.title),
      href: normalizeSingleLine(rawItem.href, fallbackItem.href),
      description: normalizeMultiline(rawItem.description, fallbackItem.description)
    };
  });
};

const normalizeTechItems = (value: unknown, fallback: readonly AboutTechItem[]): AboutTechItem[] => {
  const rawItems = Array.isArray(value) ? value : [];
  return fallback.map((fallbackItem, index) => {
    const rawItem = isRecord(rawItems[index]) ? rawItems[index] : {};
    return {
      title: normalizeSingleLine(rawItem.title, fallbackItem.title),
      description: normalizeMultiline(rawItem.description, fallbackItem.description)
    };
  });
};

const normalizeTechGroups = (value: unknown, fallback: readonly AboutTechGroup[]): AboutTechGroup[] => {
  const rawGroups = Array.isArray(value) ? value : [];
  return fallback.map((fallbackGroup, index) => {
    const rawGroup = isRecord(rawGroups[index]) ? rawGroups[index] : {};
    return {
      title: normalizeSingleLine(rawGroup.title, fallbackGroup.title),
      items: normalizeTechItems(rawGroup.items, fallbackGroup.items)
    };
  });
};

const normalizeFaqItems = (value: unknown, fallback: readonly AboutFaqItem[]): AboutFaqItem[] => {
  if (!Array.isArray(value)) {
    return fallback.map((fallbackItem) => ({ ...fallbackItem }));
  }

  return value.filter(isRecord).map((rawItem, index) => {
    const fallbackItem = fallback[index] ?? fallback[0] ?? { question: '问题', answer: '回答' };
    return {
      question: normalizeSingleLine(rawItem.question, fallbackItem.question),
      answer: normalizeMultiline(rawItem.answer, fallbackItem.answer)
    };
  });
};

export const normalizeAboutContent = (input: unknown): AboutContent => {
  const content = isRecord(input) ? input : {};
  const guide = isRecord(content.guide) ? content.guide : {};
  const tech = isRecord(content.tech) ? content.tech : {};
  const faq = isRecord(content.faq) ? content.faq : {};
  const contact = isRecord(content.contact) ? content.contact : {};

  return {
    introLines: normalizeIntroLines(content.introLines, DEFAULT_ABOUT_CONTENT.introLines),
    guide: {
      title: normalizeSingleLine(guide.title, DEFAULT_ABOUT_CONTENT.guide.title),
      items: normalizeGuideItems(guide.items, DEFAULT_ABOUT_CONTENT.guide.items)
    },
    tech: {
      title: normalizeSingleLine(tech.title, DEFAULT_ABOUT_CONTENT.tech.title),
      groups: normalizeTechGroups(tech.groups, DEFAULT_ABOUT_CONTENT.tech.groups)
    },
    faq: {
      title: normalizeSingleLine(faq.title, DEFAULT_ABOUT_CONTENT.faq.title),
      items: normalizeFaqItems(faq.items, DEFAULT_ABOUT_CONTENT.faq.items)
    },
    contact: {
      title: normalizeSingleLine(contact.title, DEFAULT_ABOUT_CONTENT.contact.title),
      note: normalizeMultiline(contact.note, DEFAULT_ABOUT_CONTENT.contact.note)
    }
  };
};

export const getAboutContent = (): AboutContent => {
  if (!existsSync(ABOUT_CONTENT_PATH)) {
    return cloneAboutContent(DEFAULT_ABOUT_CONTENT);
  }

  try {
    return normalizeAboutContent(JSON.parse(readFileSync(ABOUT_CONTENT_PATH, 'utf8')) as unknown);
  } catch (error) {
    console.warn('[astro-whono] Failed to read about content settings:', error);
    return cloneAboutContent(DEFAULT_ABOUT_CONTENT);
  }
};
