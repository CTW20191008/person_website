export type Kind = "essay" | "note" | "photo";
export type Status = "draft" | "published";

export type Piece = {
  slug: string;
  title?: string;
  summary?: string;
  kind?: Kind;
  status: Status;
  publishedAt?: string;
  created?: string;
  updated?: string;
  category?: string;
  tags: string[];
  media: string[];
  aliases: string[];
  series?: string;
  language: string;
  translationGroup?: string;
  author?: string;
  body: string;
};

export type DiagnosticCode =
  | "frontmatter-invalid"
  | "slug-missing"
  | "slug-invalid"
  | "slug-mismatch"
  | "slug-reserved"
  | "slug-duplicate"
  | "alias-conflict"
  | "status-invalid"
  | "kind-invalid"
  | "date-invalid"
  | "title-missing"
  | "summary-missing"
  | "published-at-missing"
  | "body-missing"
  | "media-missing"
  | "category-missing";

export type Diagnostic = {
  level: "fatal" | "warning";
  code: DiagnosticCode;
  slug: string;
};

export type PieceLoadResult = {
  pieces: Piece[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
};
