/// <reference types="astro/client" />

declare module 'heti/js/heti-addon' {
  export default class Heti {
    constructor(rootSelector?: string);
    spacingElements(elmList: NodeListOf<Element>): void;
    autoSpacing(): void;
  }
}
