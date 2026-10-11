// Grayscale reading of an element screenshot, for "identifiable in grayscale" checks.
import type { Locator, Page } from "@playwright/test";

/** Mean grayscale brightness (0 to 255) of the bottom rows and left columns of an element screenshot. */
export async function grayProfile(page: Page, locator: Locator) {
  const png = (await locator.screenshot()).toString("base64");
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    const gray = (x: number, y: number) => {
      const i = (y * image.width + x) * 4;
      return 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    };
    const row = (y: number) => {
      let sum = 0;
      for (let x = 0; x < image.width; x += 1) sum += gray(x, y);
      return sum / image.width;
    };
    const column = (x: number) => {
      let sum = 0;
      for (let y = 0; y < image.height; y += 1) sum += gray(x, y);
      return sum / image.height;
    };
    return {
      bottom: Math.min(row(image.height - 1), row(image.height - 2)),
      left: Math.min(column(0), column(1)),
    };
  }, png);
}
