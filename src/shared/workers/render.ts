export interface RenderRequest {
  id: number;
  text: string;
}

export type RenderResponse =
  | { id: number; ok: true; html: string }
  | { id: number; ok: false; message: string };
