export type Kind = "essay" | "note" | "photo";
export type Status = "draft" | "published";

export type Piece = {
  slug: string;
  title?: string;
  summary?: string;
  kind?: Kind;
  status: Status;
  publishedAt?: string;
  category?: string;
  media: string[];
  aliases: string[];
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
  | "category-missing"
  | "identity-missing"
  | "identity-invalid"
  | "identity-name-missing"
  | "topics-missing"
  | "topics-invalid"
  | "topics-id-invalid"
  | "topics-title-missing"
  | "topics-duplicate"
  | "category-unknown"
  | "media-invalid"
  | "media-not-found";

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

export type Identity = {
  name: string;
  body: string;
};

export type Topic = {
  id: string;
  title: string;
};

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function findTopic(topics: Topic[], key: string): Topic | undefined {
  return topics.find((topic) => topic.id === key || topic.title === key);
}

export type ContentCatalog = {
  identity?: Identity;
  topics: Topic[];
  pieces: Piece[];
  errors: Diagnostic[];
  warnings: Diagnostic[];
};
