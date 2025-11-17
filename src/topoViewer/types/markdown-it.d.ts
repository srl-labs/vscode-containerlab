/* eslint-disable no-unused-vars */
declare module 'markdown-it' {
  export interface MarkdownItOptions {
    html?: boolean;
    linkify?: boolean;
    typographer?: boolean;
    breaks?: boolean;
    langPrefix?: string;
    highlight?: (code: string, lang: string) => string;
  }

  export default class MarkdownIt {
    constructor(options?: MarkdownItOptions);
    render(markdown: string, env?: Record<string, unknown>): string;
    set(options: MarkdownItOptions): MarkdownIt;
  }
}
