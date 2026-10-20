import type { NodeSchema } from "@milkdown/kit/transformer"
import { decodeImageTitle, encodeImageTitle, normalizeImageWidth } from "./image-presentation"

/** A DOM-free schema factory shared by the editor and round-trip regression tests. */
export function imageBlockPresentationSchema(schema: NodeSchema): NodeSchema {
  return {
    ...schema,
    attrs: {
      src: { default: "", validate: "string" },
      alt: { default: "", validate: "string" },
      caption: { default: "", validate: "string" },
      width: { default: null },
    },
    parseDOM: [{
      tag: 'img[data-type="image-block"]',
      getAttrs: (element) => {
        if (!(element instanceof HTMLElement)) return false
        return {
          src: element.getAttribute("src") || "",
          alt: element.getAttribute("alt") || "",
          caption: element.getAttribute("title") || "",
          width: normalizeImageWidth(element.getAttribute("width")) ?? null,
        }
      },
    }],
    toDOM: (node) => ["img", {
      "data-type": "image-block", src: node.attrs.src, alt: node.attrs.alt,
      title: node.attrs.caption || null, width: normalizeImageWidth(node.attrs.width) ?? null,
    }],
    parseMarkdown: {
      match: ({ type }) => type === "image-block",
      runner: (state, node, type) => {
        const { title, width } = decodeImageTitle(node.title as string | undefined)
        state.addNode(type, {
          src: node.url as string, alt: (node.alt as string) || "",
          caption: title || "", width: width ?? null,
        })
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === "image-block",
      runner: (state, node) => {
        state.openNode("paragraph")
        state.addNode("image", undefined, undefined, {
          title: encodeImageTitle(node.attrs.caption || null, node.attrs.width),
          url: node.attrs.src, alt: node.attrs.alt,
        })
        state.closeNode()
      },
    },
  }
}
