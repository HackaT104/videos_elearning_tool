// Mô hình dữ liệu chuẩn (mục 3.5). JSON này là nguồn sự thật cho cả hai bộ dựng.

export type StyleId =
  | "giay-ky-thuat"
  | "toi-dien-anh"
  | "phang-tuoi-sang"
  | "bien-tap-tap-chi"
  | "bang-trang"
  | "doanh-nghiep-xanh"
  | "ban-thiet-ke"
  | "toi-gian-thuy-si"
  | "rung-dem"
  | "pastel-hoc-duong"
  | "canh-bao-an-toan"
  | "riso-coban"
  | "ky-thuat-so-toi"
  | "am-moc"
  | "khoi-mau-tap-chi"
  | "danh-muc-tinh";
export type EngineId = "hyperframes" | "remotion";
export type VoiceProvider = "cit" | "edge" | "zerotts";
export type LevelTier = "co-ban" | "trung-cap" | "chuyen-sau";

export type Sentence = {
  /** Câu hiển thị (nguyên văn kịch bản). */
  text: string;
  /** Câu đã chuẩn hóa cách đọc – gửi cho TTS. */
  tts: string;
  /** true khi người dùng đã sửa tay cột tts – không tự chuẩn hóa đè lên. */
  ttsLocked?: boolean;
  /** Cách đọc Claude đề xuất – chưa áp dụng cho tới khi người dùng chấp nhận. */
  suggest?: { tts: string; reason?: string; glossary?: { term: string; reading: string }[]; by: "ai" | "claude-code" };
  /** Phụ đề dịch theo mã ngôn ngữ (en, ja…); tiếng Việt = text. */
  subs?: Record<string, string>;
};

/** Mốc kích hoạt một phần tử: tại phân số f (0..1) của câu thứ cue trong cảnh. */
export type Beat = { cue: number; f: number };

export type SceneDesign = {
  /** Mã template (mục 6.2) hoặc "custom" / "draft". */
  template: string;
  params: Record<string, unknown>;
  /** Mã cảnh tùy biến (HTML cho HyperFrames, TSX cho Remotion) khi template = "custom". */
  customCode?: { hyperframes?: string; remotion?: string };
  /** Nguồn thiết kế: tự động (heuristic), AI, hay người dùng. */
  by: "auto" | "ai" | "user";
};

export type Scene = {
  id: string; // "s1", "s2", ...
  scriptStart: number;
  scriptEnd: number;
  title: string;
  visual: string;
  onscreen: string[];
  sentences: Sentence[];
  /** Những chỗ AI tự quyết – hiện màu vàng cho người duyệt. */
  assumptions?: string[];
  design?: SceneDesign;
  /** Ghi chú sửa của người duyệt (ngôn ngữ tự nhiên). */
  notes?: string[];
  /** Gợi ý hình từ bước Claude phân tích tài liệu (template + cách dựng) – đưa vào prompt thiết kế. */
  hint?: string;
  /** Các thiết kế trước của cảnh (mới nhất ở cuối, tối đa 5) để hoàn tác lần sửa bằng AI. */
  history?: SceneDesign[];
};

export type VoiceConfig = {
  provider: VoiceProvider;
  voiceId: string;
  speed: number;
  /** CIT: độ ngẫu nhiên VieNeu v3 Turbo (0,1–1,5; mặc định 0,8). ZeroTTS: audio_temperature (mặc định 0,8). */
  temperature?: number;
  /** CIT/ZeroTTS: cố định ngẫu nhiên để tạo lại ra đúng giọng như cũ. */
  seed?: number | null;
  /** CIT: áp dụng từ điển phát âm của CIT Voice Studio (ngoài bảng thuật ngữ của ứng dụng). */
  useDict?: boolean;
};
export type Pace = { lead: number; gap: number; tail: number };

export type Video = {
  key: string;
  course: string;
  level: string; // "L1", "L2", ...
  module: string; // "MO1"
  unit: string; // "U1.5"
  seq: string; // "1"
  title: string;
  /** Tên file gốc trong kịch bản, ví dụ "videos/MO1_U1.5_1.mp4". */
  sourceFileName?: string;
  style: StyleId;
  /** Cặp phông chữ (mã trong @cvs/themes FONT_PAIRS); trống = phông của phong cách. */
  font?: string;
  engine: EngineId;
  voice: VoiceConfig;
  pace: Pace;
  sources?: string;
  /** Ngữ cảnh xung quanh trong tài liệu (bảng số liệu, mô tả infographic…) cho bước dựng cảnh. */
  context?: string;
  /** Kịch bản do AI viết (từ outline/chủ đề) – phải được duyệt. */
  aiWritten?: boolean;
  /** Ghi đè riêng video cho phụ đề/logo của dự án (thiếu = theo dự án). */
  overlay?: { subtitle?: Partial<import("./overlay").SubtitleSettings>; logo?: Partial<import("./overlay").LogoSettings> };
  scenes: Scene[];
};

export type Cue = { start: number; end: number; text: string };

/** Mốc thời gian của một cảnh, tính theo giọng thật (hoặc ước tính). */
export type SceneTiming = {
  id: string;
  start: number; // giây, toàn video
  dur: number; // lead + audioDur + tail
  lead: number;
  tail: number;
  audioDur: number;
  /** Mốc bắt đầu từng câu, tính từ đầu cảnh (đã cộng lead). */
  cues: number[];
  /** Mốc kết thúc từng câu, tính từ đầu cảnh. */
  ends: number[];
  estimated: boolean;
  audioFile?: string;
};

export type Timing = {
  videoKey: string;
  fps: number;
  width: number;
  height: number;
  total: number;
  estimated: boolean;
  scenes: SceneTiming[];
};

export type GlossaryEntry = {
  /** Cụm cần thay (khớp nguyên từ). */
  term: string;
  /** Cách đọc. */
  reading: string;
  caseSensitive?: boolean;
  /** Ghi chú. */
  note?: string;
};

/** Quy tắc thuật ngữ bắt buộc trên màn hình (mục 7.5). */
export type TermRule = { wrong: string[]; right: string; note?: string };

export type OutlineItem = { heading: string; points: string[]; level: number };
export type OutlineDoc = {
  title: string;
  objectives: string[];
  items: OutlineItem[];
  raw: string;
};

export type InputKind = "script" | "outline" | "topic";

/** Một bài (unit) trong tài liệu nội dung module: "unit_number: 1.1", "duration", "section_2_type". */
export type DocUnit = { number: string; title: string; duration?: string; sectionType?: string; videos?: string[] };

export type ParseResult = {
  kind: InputKind;
  fileName: string;
  videos: Video[];
  /** Các bài khi tài liệu là nội dung module (có "unit_number:"). */
  units?: DocUnit[];
  outline?: OutlineDoc;
  topic?: string;
  warnings: string[];
};
