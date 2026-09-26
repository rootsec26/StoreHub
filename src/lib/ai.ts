import "server-only";

/**
 * Server-side AI text generation (Arabic copywriting).
 *
 * Talks to the OpenAI Chat Completions API when `OPENAI_API_KEY` is set and
 * falls back to deterministic mock responses otherwise (or whenever the API
 * call fails), so every AI feature keeps working in local/demo environments.
 */

export const AI_PLATFORMS = ["facebook", "instagram", "tiktok"] as const;
export type AiPlatform = (typeof AI_PLATFORMS)[number];

export type AiSource = "openai" | "mock";

export interface AiTextResult {
  text: string;
  source: AiSource;
}

export interface AiInsightsResult {
  insights: string[];
  source: AiSource;
}

export interface ProductDescriptionInput {
  name: string;
  keywords?: string;
}

export interface MarketingPostInput {
  productName: string;
  storeName: string;
  platform: AiPlatform;
  price?: string;
  keywords?: string;
}

export interface BusinessInsightsInput {
  totalOrders: number;
  totalRevenue: string;
  avgOrderValue: string;
  topProducts: { name: string; quantity: number; revenue: string }[];
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 30_000;

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Returns the assistant text, or `null` when unusable/unavailable. */
async function complete(
  system: string,
  user: string,
  maxTokens: number
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.8,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(`OpenAI request failed with status ${response.status}`);
      return null;
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    return content
      .replace(/^```(?:json|text)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  } catch (error) {
    console.warn("OpenAI request error:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. Product description
// ---------------------------------------------------------------------------

function mockProductDescription(name: string, keywords: string): string {
  const featureClause = keywords
    ? `تم تصميمه ليلائم احتياجاتك تمامًا بفضل ${clamp(keywords, 160)}، ليمنحك أداءً ثابتًا وجودة تعتمد عليها في كل استخدام.`
    : `تم تصميمه بعناية ليوفر لك جودة عالية وأداءً يعتمد عليه في الاستخدام اليومي.`;

  return `اكتشف ${name}، الاختيار الذكي الذي يجمع بين الجودة الحقيقية والقيمة العادلة. ${featureClause} اطلبه الآن من متجرنا واستمتع بتجربة شراء سريعة وتوصيل حتى بابك.`;
}

export async function generateProductDescription(
  input: ProductDescriptionInput
): Promise<AiTextResult> {
  const name = clamp(input.name.trim(), 200);
  const keywords = clamp((input.keywords ?? "").trim(), 600);

  const system = [
    "أنت كاتب تسويقي محترف متخصص في كتابة أوصاف المنتجات بالعربية الفصحى الحديثة.",
    "اكتب وصفًا للمنتج جذابًا ومقنعًا واحترافيًا من جملتين إلى أربع جمل.",
    "ركز على الفوائد والمزايا التي تهم العميل، مع نبرة تدفع للشراء.",
    "ممنوع استخدام عناوين أو نقاط أو تنسيق Markdown أو إيموجي.",
    "لا تختلق مواصفات أو أسعارًا لم تُذكر، ولا تذكر روابط أو أرقام تواصل.",
    "أعد نص الوصف فقط دون أي مقدمات أو شروح.",
  ].join(" ");

  const user = [
    `اسم المنتج: ${name}`,
    keywords ? `المميزات والكلمات المفتاحية: ${keywords}` : "لا توجد مميزات محددة — اكتب وصفًا عامًا احترافيًا.",
  ].join("\n");

  const generated = await complete(system, user, 400);
  if (generated && generated.length >= 40) {
    return { text: generated, source: "openai" };
  }

  return { text: mockProductDescription(name, keywords), source: "mock" };
}

// ---------------------------------------------------------------------------
// 2. Marketing post
// ---------------------------------------------------------------------------

const PLATFORM_RULES: Record<AiPlatform, string> = {
  facebook:
    "منصة Facebook: منشور ودّي وسهل القراءة من 3 إلى 5 جمل، يبدأ بجملة تلفت الانتباه، وينتهي بدعوة واضحة للطلب، مع 3 إلى 5 وسوم (hashtags).",
  instagram:
    "منصة Instagram: منشور بصري وقصير، أول سطر خطاف قوي، أسطر قصيرة متتابعة، إيموجي مناسبة (4 إلى 8)، و5 إلى 8 وسوم في النهاية.",
  tiktok:
    "منصة TikTok: منشور قصير جدًا ومحفّز للحركة من سطرين إلى ثلاثة، نبرة متحمسة وعصرية، ونهاية تشجّع على التعليق أو الطلب، مع 3 إلى 5 وسوم رائجة.",
};

function mockMarketingPost(input: MarketingPostInput): string {
  const { productName, storeName, platform, price, keywords } = input;
  const priceClause = price ? ` بمجرد ${price} جنيه فقط` : "";
  const angle = keywords ? ` ${clamp(keywords, 120)}.` : "";

  switch (platform) {
    case "facebook":
      return [
        `🔥 عرض لا يفوّت: ${productName}${priceClause}!`,
        ``,
        `جودة تثق بها وتجربة تسوق تستحقها.${angle}`,
        `اطلبه الآن من ${storeName} واستمتع بتوصيل سريع حتى بابك، واستفسارك يسعدنا قبل الطلب.`,
        ``,
        `👉 اطلب الآن قبل نفاد الكمية.`,
        ``,
        `#تسوق_اونلاين #عروض_اليوم #توصيل_سريع #مميّز`,
      ].join("\n");
    case "instagram":
      return [
        `✨ هل تبحث عن ${productName} المثالي؟`,
        ``,
        `جودة تُلاحظ من أول استخدام 🚀${angle}`,
        `متاح الآن${priceClause} — والطلب في خطوات فقط 💫`,
        ``,
        `🔗 اطلب الآن من ${storeName}`,
        `Tag صديقك اللي يحتاج هذا المنتج 👇`,
        ``,
        `#تسوق_اونلاين #عروض_اليوم #خصومات #توصيل_سريع #اكسبلور #ريلز #موضة_اليوم #مميز`,
      ].join("\n");
    case "tiktok":
      return [
        `انتبه 👀 ${productName} صار متاح${priceClause}!`,
        `طلبه الآن من ${storeName} قبل نفاد الكمية ⚡${angle}`,
        `اكتب "أريد" في التعليقات وسنوصل لك التفاصيل 👇🔥`,
        ``,
        `#تسوق_اونلاين #عروض #توصيل_سريع #ريلز`,
      ].join("\n");
  }
}

export async function generateMarketingPost(
  input: MarketingPostInput
): Promise<AiTextResult> {
  const productName = clamp(input.productName.trim(), 200);
  const storeName = clamp(input.storeName.trim(), 120);
  const price = clamp((input.price ?? "").trim(), 32);
  const keywords = clamp((input.keywords ?? "").trim(), 400);

  const system = [
    "أنت خبير تسويق اجتماعي تكتب منشورات إعلانية بالعربية الفصحى العصرية.",
    "اكتب منشورًا جاهزًا للنشر يروّج للمنتج بأسلوب مقنع ومليء بالإيموجي المناسبة.",
    "يجب أن يتضمن: افتتاحية قوية، إبراز المزايا، دعوة واضحة للإجراء (CTA)، ووسوم (hashtags).",
    PLATFORM_RULES[input.platform],
    "ممنوع استخدام Markdown أو عناوين أو تنسيق الأكواد، وأعد النص فقط دون أي مقدمات.",
    "اذكر اسم المتجر في المنشور ولا تختلق أرقامًا أو عروضًا غير مذكورة.",
  ].join(" ");

  const user = [
    `اسم المنتج: ${productName}`,
    `اسم المتجر: ${storeName}`,
    price ? `السعر: ${price} EGP` : "السعر: غير محدد",
    keywords ? `زاوية الترويج: ${keywords}` : "لا توجد زاوية ترويج محددة — ابتكر عرضًا عامًا جذابًا.",
  ].join("\n");

  const generated = await complete(system, user, 500);
  if (generated && generated.length >= 40) {
    return { text: generated, source: "openai" };
  }

  return { text: mockMarketingPost({ ...input, productName, storeName, price }), source: "mock" };
}

// ---------------------------------------------------------------------------
// 3. Business insights
// ---------------------------------------------------------------------------

function parseInsights(raw: string): string[] | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { insights?: unknown };
    if (!Array.isArray(parsed.insights)) return null;

    const items = parsed.insights
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());

    return items.length === 3 ? items : null;
  } catch {
    return null;
  }
}

function mockBusinessInsights(input: BusinessInsightsInput): string[] {
  const orders = input.totalOrders;
  const revenue = input.totalRevenue || "0";
  const avgOrderValue = parseFloat(input.avgOrderValue) || 0;
  const top = input.topProducts[0];

  if (orders === 0) {
    return [
      "لا توجد طلبات بعد: شارك رابط متجرك مباشرة مع معارفك وعلى واتساب وفي منشورات منصاتك الاجتماعية لجلب أول 5 طلبات.",
      "جهّز 3 منتجات قوية: أضف صورًا احترافية وأوصافًا تفصيلية لزيادة ثقة الزائر ورفع معدّل التحويل إلى طلب.",
      "أطلق عرضًا ترحيبيًا محدود المدة (خصم 10% أو شحن مجاني) لخلق استعجال الشراء ودفع العملاء للتجربة الآن.",
    ];
  }

  const bestSeller = top
    ? `كرّر نجاح "${top.name}" الذي حقق ${top.quantity} مبيعًا بإيرادات ${top.revenue} جنيه: اجعله بطل إعلاناتك هذا الأسبوع وأضف عرض "احصل عليه مع منتج آخر" لرفع متوسط السلة.`
    : "أبرز أفضل منتجاتك في أول مساحة من متجرك وفي منشوراتك الاجتماعية لتوجيه الزوار مباشرة نحو الأكثر مبيعًا.";

  const aovAdvice =
    avgOrderValue < 250
      ? `متوسط قيمة الطلب ${avgOrderValue.toFixed(2)} جنيه وهو منخفض: أنشئ باقات ("اشترِ 2 واحصل على خصم") واربط منتجات مكملة ببعضها لرفع قيمة كل طلب.`
      : `متوسط قيمة الطلب ${avgOrderValue.toFixed(2)} جنيه في مستوى جيد: أضف شحنًا مجانيًا للطلبات فوق هذا الحد بقليل لتشجيع عملاءك على إضافة المزيد.`;

  const retention = `بعد ${orders} طلبًا وإيرادات ${revenue} جنيه: أعد تفعيل عملائك السابقين برسالة واتساب بعرض حصري، وأعد استهداف زوار متجرك غير المشترين بمنشور يبرز أفضل منتجاتك.`;

  return [bestSeller, aovAdvice, retention];
}

export async function generateBusinessInsights(
  input: BusinessInsightsInput
): Promise<AiInsightsResult> {
  const totalOrders = Math.max(0, Math.floor(input.totalOrders));
  const totalRevenue = clamp(input.totalRevenue || "0", 32);
  const avgOrderValue = clamp(input.avgOrderValue || "0", 32);
  const topProducts = input.topProducts.slice(0, 5).map((product) => ({
    name: clamp(product.name, 120),
    quantity: Math.max(0, Math.floor(product.quantity)),
    revenue: clamp(product.revenue || "0", 32),
  }));

  const system = [
    "أنت مستشار نمو متاجر إلكترونية مخضرم تقدم توصيات عملية لتجار عرب.",
    "حلّل الأرقام المقدمة وقدّم بالضبط 3 توصيات عملية لزيادة مبيعات المتجر.",
    "كل توصية يجب أن تكون محددة وقابلة للتنفيذ خلال أسبوع، وتعتمد على الأرقام المرسلة.",
    "أعد النص بصيغة JSON فقط بهذا الشكل تمامًا: {\"insights\":[\"توصية 1\",\"توصية 2\",\"توصية 3\"]}",
    "لا تضف أي نص خارج الـ JSON، ولا Markdown، ولا أسماء ملفات أو أكواد.",
  ].join(" ");

  const user = [
    `إجمالي الطلبات: ${totalOrders}`,
    `إجمالي الإيرادات (EGP): ${totalRevenue}`,
    `متوسط قيمة الطلب (EGP): ${avgOrderValue}`,
    topProducts.length > 0
      ? `أفضل المنتجات مبيعًا:\n${topProducts
          .map((p, i) => `${i + 1}. ${p.name} — ${p.quantity} مبيعًا — ${p.revenue} جنيه`)
          .join("\n")}`
      : "لا توجد بيانات منتجات مبيع بعد.",
  ].join("\n");

  const generated = await complete(system, user, 600);
  const parsed = generated ? parseInsights(generated) : null;
  if (parsed) {
    return { insights: parsed, source: "openai" };
  }

  return {
    insights: mockBusinessInsights({ totalOrders, totalRevenue, avgOrderValue, topProducts }),
    source: "mock",
  };
}
