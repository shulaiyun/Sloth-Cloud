type OperatorLlmProviderName = 'openai' | 'gemini' | 'claude';

export interface OperatorLlmProviderConfig {
  name: OperatorLlmProviderName;
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
}

export type GeneratedProjectStage = 'backlog' | 'building' | 'ready';
export type GeneratedProjectKind = 'workflow-app' | 'battle-game' | 'snake-game' | 'static-launch';
export type GeneratedProjectLocale = 'zh-CN' | 'en';

export interface GeneratedProjectSeedItem {
  title: string;
  detail: string;
  stage: GeneratedProjectStage;
}

export interface GeneratedProjectBattleRecipe {
  heroName: string;
  enemyName: string;
  supportName: string;
  intro: string;
  attackLabel: string;
  skillLabel: string;
  healLabel: string;
  victoryText: string;
  defeatText: string;
}

export interface GeneratedProjectRecipe {
  locale: GeneratedProjectLocale;
  kind: GeneratedProjectKind;
  title: string;
  subtitle: string;
  audience: string;
  goal: string;
  stackHint: string;
  primaryActionLabel: string;
  itemLabel: string;
  seedItems: GeneratedProjectSeedItem[];
  journeyMoments: string[];
  operatorChecklist: string[];
  helpfulPoints: string[];
  battle: GeneratedProjectBattleRecipe | null;
}

export interface PlanGeneratedProjectRecipeResult {
  recipe: GeneratedProjectRecipe;
  trace: {
    usedModel: boolean;
    provider: string | null;
    model: string | null;
    error: string | null;
  };
}

export interface GeneratedProjectBundleFile {
  path: string;
  purpose: string;
  content: string;
}

export interface GeneratedProjectBundle {
  entryFile: string;
  runCommands: string[];
  files: GeneratedProjectBundleFile[];
}

export interface GenerateProjectBundleResult {
  bundle: GeneratedProjectBundle | null;
  trace: {
    usedModel: boolean;
    provider: string | null;
    model: string | null;
    error: string | null;
  };
}

interface GenerateProjectIdeaInput {
  projectName?: string | null;
  idea: string;
  audience?: string | null;
  businessGoal?: string | null;
}

function trimText(value: string | null | undefined) {
  return (value ?? '').trim();
}

function containsChinese(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();
}

function compactTitle(rawName: string, rawIdea: string, locale: GeneratedProjectLocale) {
  const source = trimText(rawName) || trimText(rawIdea) || (locale === 'zh-CN' ? 'AI 工作区项目' : 'AI workspace project');
  const singleLine = source.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const firstSentence = singleLine.split(/[。！？!?;；]/)[0]?.trim() || singleLine;

  if (locale === 'zh-CN') {
    const keywordMatch = firstSentence.match(/[^，。！？!?]{2,24}(?:应用|网站|平台|系统|工具|游戏|小程序)/);
    const cleaned = (keywordMatch?.[0] ?? firstSentence)
      .replace(/^(帮我|请|麻烦你|我想|我要|希望|帮忙)/, '')
      .replace(/^(做|开发|生成|设计|搭建|构建|制作|创建|打造|生产)(一个|个)?/, '')
      .replace(/^(一个|个)/, '')
      .trim();
    return (cleaned || firstSentence).slice(0, 24) || 'AI 工作区项目';
  }

  return firstSentence.split(/\s+/).filter(Boolean).slice(0, 6).join(' ').slice(0, 32) || 'AI workspace project';
}

function normalizeProviderBaseUrl(provider: OperatorLlmProviderConfig) {
  const explicit = trimText(provider.baseUrl);
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }

  if (provider.name === 'openai') {
    return 'https://api.openai.com/v1';
  }

  return '';
}

function extractLlmText(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return '';
  }

  const record = payload as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const first = choices[0];
  if (!first || typeof first !== 'object') {
    return '';
  }

  const message = (first as Record<string, unknown>).message;
  if (typeof message !== 'object' || message === null) {
    return '';
  }

  const content = (message as Record<string, unknown>).content;
  if (typeof content === 'string') {
    return normalizeWhitespace(content);
  }

  if (Array.isArray(content)) {
    return normalizeWhitespace(content.map((entry) => {
      if (typeof entry === 'string') return entry;
      if (typeof entry !== 'object' || entry === null) return '';
      const item = entry as Record<string, unknown>;
      return typeof item.text === 'string' ? item.text : '';
    }).join('\n\n'));
  }

  return '';
}

function extractJsonObject(text: string) {
  const cleaned = normalizeWhitespace(text)
    .replace(/^```json/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return cleaned.slice(firstBrace, lastBrace + 1);
}

function normalizeStage(value: unknown): GeneratedProjectStage {
  if (value === 'ready' || value === 'building' || value === 'backlog') {
    return value;
  }
  return 'backlog';
}

function normalizeBundlePath(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..') || normalized.includes('//')) {
    return null;
  }

  return normalized;
}

async function resolveProviderAttempt<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: string,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutError)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function isSnakeIdea(input: GenerateProjectIdeaInput) {
  const signal = [
    trimText(input.projectName),
    trimText(input.idea),
    trimText(input.businessGoal),
  ].join(' ').toLowerCase();
  return signal.includes('贪吃蛇') || signal.includes('snake');
}

function isBattleIdea(input: GenerateProjectIdeaInput) {
  const signal = [
    trimText(input.projectName),
    trimText(input.idea),
    trimText(input.businessGoal),
  ].join(' ').toLowerCase();

  return [
    '打怪',
    '怪兽',
    'boss',
    'monster',
    'battle',
    'fighter',
    'combat',
    'rpg',
    'hero',
    'superhero',
    '射击',
    '闯关',
    '对战',
  ].some((keyword) => signal.includes(keyword));
}

export function detectGeneratedProjectLocale(input: GenerateProjectIdeaInput): GeneratedProjectLocale {
  const signal = [
    trimText(input.projectName),
    trimText(input.idea),
    trimText(input.audience),
    trimText(input.businessGoal),
  ].join(' ');
  return containsChinese(signal) ? 'zh-CN' : 'en';
}

export function buildFallbackGeneratedProjectRecipe(
  input: GenerateProjectIdeaInput,
  preferredName?: string | null,
): GeneratedProjectRecipe {
  const locale = detectGeneratedProjectLocale(input);
  const zh = locale === 'zh-CN';
  const title = compactTitle(trimText(preferredName), input.idea, locale);
  const audience = trimText(input.audience) || (zh ? '普通用户' : 'general users');
  const goal = trimText(input.businessGoal) || (zh ? '低门槛快速上线并可持续运营' : 'launch quickly with low-friction operations');

  if (isSnakeIdea(input)) {
    return {
      locale,
      kind: 'snake-game',
      title,
      subtitle: zh ? '一版可试玩的街机小游戏，先让人马上上手。' : 'A first playable arcade mini-game that is instantly tryable.',
      audience,
      goal,
      stackHint: zh ? '静态网页小游戏' : 'static web mini game',
      primaryActionLabel: zh ? '开始游戏' : 'Start game',
      itemLabel: zh ? '关卡点子' : 'level idea',
      seedItems: [
        {
          title: zh ? '进入游戏' : 'Enter the game',
          detail: zh ? '点击开始后立刻能玩，不先看说明书。' : 'Players can start immediately without setup friction.',
          stage: 'ready',
        },
        {
          title: zh ? '反馈强化' : 'Feedback loop',
          detail: zh ? '把分数、最佳成绩和暂停状态都看得清楚。' : 'Show score, best score, and pause state clearly.',
          stage: 'building',
        },
        {
          title: zh ? '托管上线' : 'Launch path',
          detail: zh ? '同一个小游戏包继续进入预览、托管和迁移流程。' : 'Promote the same game bundle into preview and hosting.',
          stage: 'backlog',
        },
      ],
      journeyMoments: zh
        ? ['打开页面就能开局。', '失败后能一键再来一局。', '分数反馈足够明显，值得继续迭代。']
        : ['The first session starts immediately.', 'Players can retry in one click.', 'Scoring feedback is visible enough to iterate further.'],
      operatorChecklist: zh
        ? ['预览与正式版共用同一个源码包。', '小游戏状态和日志可以继续接入运维。', '确认满意后再推进托管上线。']
        : ['Preview and production can share one bundle.', 'Logs and runtime hooks can be attached later.', 'Promote only after the playable version feels right.'],
      helpfulPoints: zh
        ? ['先做可玩闭环，再继续加特效。', '保留本地状态，让试玩更连贯。', '同一个包后续继续用于上线。']
        : ['Prioritize a playable loop before polish.', 'Keep local state for continuity.', 'Reuse the same bundle for launch.'],
      battle: null,
    };
  }

  if (isBattleIdea(input)) {
    return {
      locale,
      kind: 'battle-game',
      title,
      subtitle: zh ? '一版能打、能回血、能结算的轻量战斗页。' : 'A light battle page with attack, heal, and a complete win/lose loop.',
      audience,
      goal,
      stackHint: zh ? '静态网页战斗小游戏' : 'static browser battle game',
      primaryActionLabel: zh ? '开始战斗' : 'Start battle',
      itemLabel: zh ? '战斗节点' : 'battle step',
      seedItems: [
        {
          title: zh ? '第一回合马上开打' : 'Open with instant action',
          detail: zh ? '用户打开页面后立刻能看到技能和血量变化。' : 'Players should see skills and health changes immediately.',
          stage: 'ready',
        },
        {
          title: zh ? '技能反馈更明显' : 'Strengthen skill feedback',
          detail: zh ? '每次攻击、必杀和治疗都要留下清晰战报。' : 'Each move should leave a clear combat log.',
          stage: 'building',
        },
        {
          title: zh ? '继续扩展关卡' : 'Expand the encounter',
          detail: zh ? '后续可以继续接角色、敌人和更多回合机制。' : 'Later iterations can add more enemies and mechanics.',
          stage: 'backlog',
        },
      ],
      journeyMoments: zh
        ? ['玩家能一眼看懂自己该按哪个按钮。', '每个动作都会推动一回合战斗。', '赢或输之后都能立即重开。']
        : ['Players immediately understand the next action.', 'Every click advances one combat round.', 'A restart is always one tap away.'],
      operatorChecklist: zh
        ? ['页面必须真能操作，不只是介绍战斗设定。', '预览版和托管版共用一个源码包。', '保留日志，方便后续迭代技能和平衡。']
        : ['The page must be truly interactive, not a static pitch.', 'Preview and hosting share the same bundle.', 'Keep logs so balance changes are easy later.'],
      helpfulPoints: zh
        ? ['把核心按钮留在首屏。', '用战报降低理解成本。', '胜负反馈要明显。']
        : ['Keep the core actions above the fold.', 'Use a combat log to reduce confusion.', 'Make the outcome unmistakable.'],
      battle: {
        heroName: zh ? '超人' : 'Hero',
        enemyName: zh ? '怪兽' : 'Monster',
        supportName: zh ? '能量核心' : 'Power core',
        intro: zh ? '用普通攻击、强力技能和治疗，先打出一套能闭环的回合战斗。' : 'Use attacks, skills, and healing to create a complete battle loop.',
        attackLabel: zh ? '普通攻击' : 'Attack',
        skillLabel: zh ? '放大招' : 'Skill',
        healLabel: zh ? '恢复体力' : 'Heal',
        victoryText: zh ? '战斗胜利，第一版玩法已经跑通。' : 'Victory. The first playable battle loop is working.',
        defeatText: zh ? '本局失败，再来一局继续调试节奏。' : 'Defeat. Restart and keep tuning the battle rhythm.',
      },
    };
  }

  return {
    locale,
    kind: 'workflow-app',
    title,
    subtitle: zh ? '先做一版真正可操作的应用工作台，再继续往正式产品推进。' : 'Start with a real interactive workspace, then grow it into production.',
    audience,
    goal,
    stackHint: zh ? '交互式网页应用' : 'interactive web application',
    primaryActionLabel: zh ? '新增一条可体验流程' : 'Add one testable flow',
    itemLabel: zh ? '流程' : 'flow',
    seedItems: [
      {
        title: zh ? '第一个用户动作' : 'First user action',
        detail: zh ? `帮助${audience}在两分钟内完成主要结果。` : `Help ${audience} reach the main outcome in less than two minutes.`,
        stage: 'ready',
      },
      {
        title: zh ? '核心转化点' : 'Core conversion',
        detail: goal,
        stage: 'building',
      },
      {
        title: zh ? '运营控制位' : 'Operator control',
        detail: zh ? '保留日志、回滚和上线决策的位置。' : 'Keep one place for logs, rollback, and launch decisions.',
        stage: 'backlog',
      },
    ],
    journeyMoments: zh
      ? ['用户打开页面后立刻知道下一步做什么。', '第一个关键动作几乎不用学习成本。', '预览版已经能表达产品价值。']
      : ['Users immediately know the next step.', 'The first meaningful action requires almost no learning.', 'The preview already communicates product value.'],
    operatorChecklist: zh
      ? ['预览与正式版使用同一个工作区。', '源码包可以编辑、下载并继续托管。', '结算应推广同一个构建，而不是重新生成第二个应用。']
      : ['Preview and production should share the same workspace.', 'The source bundle should stay editable and downloadable.', 'Checkout should promote the same build instead of regenerating another app.'],
    helpfulPoints: zh
      ? ['这不是海报，而是能改数据的第一版应用。', '用户侧和运营侧都能在同一个页面验证。', '本地状态保存能让迭代更连贯。']
      : ['This is not a poster but a stateful first-version app.', 'Customer and operator views can be reviewed together.', 'Local state keeps iteration continuous.'],
    battle: null,
  };
}

function coerceBattleRecipe(value: unknown, locale: GeneratedProjectLocale) {
  const fallback = buildFallbackGeneratedProjectRecipe({
    idea: locale === 'zh-CN' ? '超人打怪兽的游戏' : 'hero versus monster battle game',
  });
  const battleFallback = fallback.battle;
  if (!battleFallback) {
    return null;
  }
  if (typeof value !== 'object' || value === null) {
    return battleFallback;
  }

  const record = value as Record<string, unknown>;
  return {
    heroName: trimText(typeof record.heroName === 'string' ? record.heroName : '') || battleFallback.heroName,
    enemyName: trimText(typeof record.enemyName === 'string' ? record.enemyName : '') || battleFallback.enemyName,
    supportName: trimText(typeof record.supportName === 'string' ? record.supportName : '') || battleFallback.supportName,
    intro: trimText(typeof record.intro === 'string' ? record.intro : '') || battleFallback.intro,
    attackLabel: trimText(typeof record.attackLabel === 'string' ? record.attackLabel : '') || battleFallback.attackLabel,
    skillLabel: trimText(typeof record.skillLabel === 'string' ? record.skillLabel : '') || battleFallback.skillLabel,
    healLabel: trimText(typeof record.healLabel === 'string' ? record.healLabel : '') || battleFallback.healLabel,
    victoryText: trimText(typeof record.victoryText === 'string' ? record.victoryText : '') || battleFallback.victoryText,
    defeatText: trimText(typeof record.defeatText === 'string' ? record.defeatText : '') || battleFallback.defeatText,
  };
}

function coerceRecipe(
  raw: unknown,
  input: GenerateProjectIdeaInput,
  preferredName?: string | null,
): GeneratedProjectRecipe {
  const fallback = buildFallbackGeneratedProjectRecipe(input, preferredName);
  if (typeof raw !== 'object' || raw === null) {
    return fallback;
  }

  const record = raw as Record<string, unknown>;
  const locale = record.locale === 'zh-CN' || record.locale === 'en'
    ? record.locale
    : fallback.locale;
  const kind = record.kind === 'workflow-app'
    || record.kind === 'battle-game'
    || record.kind === 'snake-game'
    || record.kind === 'static-launch'
    ? record.kind
    : fallback.kind;

  const seedItems = Array.isArray(record.seedItems)
    ? record.seedItems
      .map((entry) => {
        if (typeof entry !== 'object' || entry === null) {
          return null;
        }
        const item = entry as Record<string, unknown>;
        const title = trimText(typeof item.title === 'string' ? item.title : '');
        const detail = trimText(typeof item.detail === 'string' ? item.detail : '');
        if (!title || !detail) {
          return null;
        }
        return {
          title,
          detail,
          stage: normalizeStage(item.stage),
        } satisfies GeneratedProjectSeedItem;
      })
      .filter((entry): entry is GeneratedProjectSeedItem => entry !== null)
    : [];

  const journeyMoments = Array.isArray(record.journeyMoments)
    ? record.journeyMoments.map((entry) => trimText(typeof entry === 'string' ? entry : '')).filter(Boolean)
    : [];
  const operatorChecklist = Array.isArray(record.operatorChecklist)
    ? record.operatorChecklist.map((entry) => trimText(typeof entry === 'string' ? entry : '')).filter(Boolean)
    : [];
  const helpfulPoints = Array.isArray(record.helpfulPoints)
    ? record.helpfulPoints.map((entry) => trimText(typeof entry === 'string' ? entry : '')).filter(Boolean)
    : [];

  const merged: GeneratedProjectRecipe = {
    locale,
    kind,
    title: trimText(typeof record.title === 'string' ? record.title : '') || fallback.title,
    subtitle: trimText(typeof record.subtitle === 'string' ? record.subtitle : '') || fallback.subtitle,
    audience: trimText(typeof record.audience === 'string' ? record.audience : '') || fallback.audience,
    goal: trimText(typeof record.goal === 'string' ? record.goal : '') || fallback.goal,
    stackHint: trimText(typeof record.stackHint === 'string' ? record.stackHint : '') || fallback.stackHint,
    primaryActionLabel: trimText(typeof record.primaryActionLabel === 'string' ? record.primaryActionLabel : '') || fallback.primaryActionLabel,
    itemLabel: trimText(typeof record.itemLabel === 'string' ? record.itemLabel : '') || fallback.itemLabel,
    seedItems: seedItems.length > 0 ? seedItems.slice(0, 6) : fallback.seedItems,
    journeyMoments: journeyMoments.length > 0 ? journeyMoments.slice(0, 4) : fallback.journeyMoments,
    operatorChecklist: operatorChecklist.length > 0 ? operatorChecklist.slice(0, 4) : fallback.operatorChecklist,
    helpfulPoints: helpfulPoints.length > 0 ? helpfulPoints.slice(0, 4) : fallback.helpfulPoints,
    battle: kind === 'battle-game'
      ? coerceBattleRecipe(record.battle, locale)
      : kind === 'snake-game'
        ? null
        : fallback.battle,
  };

  return merged;
}

function coerceBundle(
  raw: unknown,
  recipe: GeneratedProjectRecipe,
): GeneratedProjectBundle | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const allowedPaths = new Set(['index.html', 'styles.css', 'app.js', 'README.md', 'Dockerfile']);
  const pushFile = (pathLike: unknown, rawValue: unknown) => {
    const path = normalizeBundlePath(pathLike);
    if (!path || !allowedPaths.has(path)) {
      return null;
    }

    if (typeof rawValue === 'string') {
      const content = normalizeWhitespace(rawValue);
      if (!content) {
        return null;
      }
      return {
        path,
        purpose: path,
        content,
      } satisfies GeneratedProjectBundleFile;
    }

    if (typeof rawValue !== 'object' || rawValue === null) {
      return null;
    }

    const entry = rawValue as Record<string, unknown>;
    const content = typeof entry.content === 'string' ? normalizeWhitespace(entry.content) : '';
    if (!content) {
      return null;
    }

    return {
      path,
      purpose: trimText(typeof entry.purpose === 'string' ? entry.purpose : '') || path,
      content,
    } satisfies GeneratedProjectBundleFile;
  };

  const fileCandidates: GeneratedProjectBundleFile[] = [];

  if (Array.isArray(record.files)) {
    for (const entry of record.files) {
      if (typeof entry !== 'object' || entry === null) {
        continue;
      }

      const file = entry as Record<string, unknown>;
      const normalized = pushFile(file.path, file);
      if (normalized) {
        fileCandidates.push(normalized);
      }
    }
  }

  if (typeof record.files === 'object' && record.files !== null && !Array.isArray(record.files)) {
    for (const [pathLike, rawValue] of Object.entries(record.files as Record<string, unknown>)) {
      const normalized = pushFile(pathLike, rawValue);
      if (normalized) {
        fileCandidates.push(normalized);
      }
    }
  }

  for (const pathLike of ['index.html', 'styles.css', 'app.js', 'README.md', 'Dockerfile']) {
    if (pathLike in record) {
      const normalized = pushFile(pathLike, record[pathLike]);
      if (normalized) {
        fileCandidates.push(normalized);
      }
    }
  }

  const files = [...new Map(fileCandidates.map((file) => [file.path, file])).values()];

  const fileByPath = new Map(files.map((file) => [file.path, file]));
  const indexFile = fileByPath.get('index.html');
  const styleFile = fileByPath.get('styles.css');
  const appFile = fileByPath.get('app.js');
  if (!indexFile || !styleFile || !appFile) {
    return null;
  }

  const html = indexFile.content.toLowerCase();
  if (!html.includes('styles.css') || !html.includes('app.js')) {
    return null;
  }

  const js = appFile.content.toLowerCase();
  if (!js.includes('localstorage') || (!js.includes('addEventListener') && !js.includes('onclick'))) {
    return null;
  }

  const fallbackRunCommand = recipe.locale === 'zh-CN'
    ? 'python3 -m http.server 3000'
    : 'python3 -m http.server 3000';
  const runCommands = Array.isArray(record.runCommands)
    ? record.runCommands
      .map((entry) => trimText(typeof entry === 'string' ? entry : ''))
      .filter(Boolean)
      .slice(0, 4)
    : [];

  return {
    entryFile: 'index.html',
    runCommands: runCommands.length > 0 ? runCommands : [fallbackRunCommand],
    files,
  };
}

async function requestRecipeFromProvider(
  provider: OperatorLlmProviderConfig,
  input: GenerateProjectIdeaInput,
  timeoutMs: number,
  preferredName?: string | null,
) {
  const apiKey = trimText(provider.apiKey);
  const baseUrl = normalizeProviderBaseUrl(provider);
  const model = trimText(provider.model);
  if (!apiKey || !baseUrl || !model) {
    return null;
  }

  const locale = detectGeneratedProjectLocale(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        temperature: 0.15,
        messages: [
          {
            role: 'system',
            content: [
              'You are the Sloth Cloud Operator Executor.',
              'Convert one product idea into a real first-version interactive web application recipe.',
              'Do not output a poster, brochure, deck, or static summary.',
              'Prefer workflow-app unless the request clearly asks for a playable game.',
              'Use snake-game only for snake ideas. Use battle-game for hero, monster, combat, or arcade battle ideas.',
              'All user-facing strings must match the requested locale.',
              'Return JSON only. No markdown fences.',
              'Schema:',
              '{"locale":"zh-CN|en","kind":"workflow-app|battle-game|snake-game|static-launch","title":"...","subtitle":"...","audience":"...","goal":"...","stackHint":"...","primaryActionLabel":"...","itemLabel":"...","seedItems":[{"title":"...","detail":"...","stage":"backlog|building|ready"}],"journeyMoments":["..."],"operatorChecklist":["..."],"helpfulPoints":["..."],"battle":{"heroName":"...","enemyName":"...","supportName":"...","intro":"...","attackLabel":"...","skillLabel":"...","healLabel":"...","victoryText":"...","defeatText":"..."}}',
              'Keep copy concise and operational. seedItems should be 3 to 4 entries.',
            ].join(' '),
          },
          {
            role: 'user',
            content: [
              `locale=${locale}`,
              `projectName=${trimText(preferredName) || '-'}`,
              `idea=${trimText(input.idea)}`,
              `audience=${trimText(input.audience) || '-'}`,
              `businessGoal=${trimText(input.businessGoal) || '-'}`,
            ].join('\n'),
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`provider=${provider.name} status=${response.status} detail=${detail.slice(0, 240)}`);
    }

    const payload = await response.json().catch(() => ({}));
    const text = extractLlmText(payload);
    const jsonBlock = text ? extractJsonObject(text) : null;
    if (!jsonBlock) {
      return null;
    }

    return {
      recipe: coerceRecipe(JSON.parse(jsonBlock), input, preferredName),
      provider: provider.name,
      model,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function requestBundleFromProvider(
  provider: OperatorLlmProviderConfig,
  input: GenerateProjectIdeaInput,
  recipe: GeneratedProjectRecipe,
  timeoutMs: number,
  preferredName?: string | null,
) {
  const apiKey = trimText(provider.apiKey);
  const baseUrl = normalizeProviderBaseUrl(provider);
  const model = trimText(provider.model);
  if (!apiKey || !baseUrl || !model) {
    return null;
  }

  const locale = recipe.locale;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 3500,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: [
              'You are the Sloth Cloud Operator Executor.',
              'Generate a real first-version single-page web application as raw files.',
              'The result must feel like a usable prototype, not a poster, PPT, brochure, launch page, or static summary.',
              'Use vanilla HTML, CSS, and JavaScript only. No framework, CDN, JSX, TypeScript, import, or export.',
              'The app must work directly in a browser with one normal script tag.',
              'The app must keep meaningful state in localStorage.',
              'Include at least three genuinely interactive behaviors relevant to the brief, such as create/edit/delete, progress, filters, toggles, scoring, scheduling, forms, queues, or saved preferences.',
              'Keep all user-visible strings in the requested locale.',
              'Return JSON only. No markdown fences if possible.',
              'Schema:',
              '{"runCommands":["python3 -m http.server 3000"],"files":[{"path":"index.html","purpose":"App shell","content":"..."},{"path":"styles.css","purpose":"App styling","content":"..."},{"path":"app.js","purpose":"Interactive logic","content":"..."}]}',
              'Accepted alternative schema when needed:',
              '{"runCommands":["python3 -m http.server 3000"],"files":{"index.html":"...","styles.css":"...","app.js":"..."}}',
              'Requirements:',
              '- index.html must reference ./styles.css and ./app.js',
              '- app.js must attach event listeners and render live state changes',
              '- app.js must use localStorage',
              '- Do not mention Sloth Cloud unless the product brief itself requires it',
              '- Keep the code concise but valid and complete',
            ].join(' '),
          },
          {
            role: 'user',
            content: [
              `locale=${locale}`,
              `projectName=${trimText(preferredName) || trimText(recipe.title) || '-'}`,
              `idea=${trimText(input.idea)}`,
              `audience=${trimText(input.audience) || trimText(recipe.audience) || '-'}`,
              `businessGoal=${trimText(input.businessGoal) || trimText(recipe.goal) || '-'}`,
              `recipe=${JSON.stringify(recipe)}`,
            ].join('\n'),
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`provider=${provider.name} status=${response.status} detail=${detail.slice(0, 240)}`);
    }

    const payload = await response.json().catch(() => ({}));
    const text = extractLlmText(payload);
    const jsonBlock = text ? extractJsonObject(text) : null;
    if (!jsonBlock) {
      return null;
    }

    const bundle = coerceBundle(JSON.parse(jsonBlock), recipe);
    if (!bundle) {
      return null;
    }

    return {
      bundle,
      provider: provider.name,
      model,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function planGeneratedProjectRecipe(
  input: GenerateProjectIdeaInput,
  preferredName?: string | null,
  providers: OperatorLlmProviderConfig[] = [],
): Promise<PlanGeneratedProjectRecipeResult> {
  const failures: string[] = [];
  const timeoutFor = (provider: OperatorLlmProviderConfig) => {
    if (provider.name === 'claude') return 25_000;
    if (provider.name === 'gemini') return 40_000;
    if (provider.name === 'openai') return 60_000;
    return 30_000;
  };

  for (const provider of providers) {
    try {
      const timeoutMs = timeoutFor(provider);
      const planned = await resolveProviderAttempt(
        requestRecipeFromProvider(provider, input, timeoutMs, preferredName),
        timeoutMs,
        `provider=${provider.name} recipe_timeout`,
      );
      if (planned) {
        return {
          recipe: planned.recipe,
          trace: {
            usedModel: true,
            provider: planned.provider,
            model: planned.model,
            error: null,
          },
        };
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    recipe: buildFallbackGeneratedProjectRecipe(input, preferredName),
    trace: {
      usedModel: false,
      provider: null,
      model: null,
      error: failures.length > 0 ? failures.join(' | ').slice(0, 600) : null,
    },
  };
}

export async function generateProjectBundleFromModel(
  input: GenerateProjectIdeaInput,
  recipe: GeneratedProjectRecipe,
  preferredName?: string | null,
  providers: OperatorLlmProviderConfig[] = [],
): Promise<GenerateProjectBundleResult> {
  const failures: string[] = [];
  const prioritizedProviders = [...providers].sort((left, right) => {
    const rank = (provider: OperatorLlmProviderConfig) => {
      if (provider.name === 'claude') return 0;
      if (provider.name === 'gemini') return 1;
      if (provider.name === 'openai') return 2;
      return 3;
    };
    return rank(left) - rank(right);
  });

  const timeoutFor = (provider: OperatorLlmProviderConfig) => {
    if (provider.name === 'claude') return 90_000;
    if (provider.name === 'gemini') return 180_000;
    if (provider.name === 'openai') return 300_000;
    return 90_000;
  };

  for (const provider of prioritizedProviders) {
    try {
      const timeoutMs = timeoutFor(provider);
      const generated = await resolveProviderAttempt(
        requestBundleFromProvider(provider, input, recipe, timeoutMs, preferredName),
        timeoutMs,
        `provider=${provider.name} bundle_timeout`,
      );
      if (generated) {
        return {
          bundle: generated.bundle,
          trace: {
            usedModel: true,
            provider: generated.provider,
            model: generated.model,
            error: null,
          },
        };
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    bundle: null,
    trace: {
      usedModel: false,
      provider: null,
      model: null,
      error: failures.length > 0 ? failures.join(' | ').slice(0, 600) : null,
    },
  };
}
