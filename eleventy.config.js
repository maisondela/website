import Image, { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import markdownIt from "markdown-it";
import { HtmlBasePlugin } from "@11ty/eleventy";

const md = markdownIt();

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({
    "node_modules/three/build/three.module.min.js":
      "assets/vendor/three.module.min.js",
    "node_modules/three/build/three.core.min.js":
      "assets/vendor/three.core.min.js",
  });
  eleventyConfig.addPassthroughCopy("uploads");
  eleventyConfig.addPassthroughCopy("admin");

  eleventyConfig.ignores.add("admin/**");
  eleventyConfig.ignores.add("README.md");
  eleventyConfig.ignores.add("CLAUDE.md");

  eleventyConfig.addPlugin(HtmlBasePlugin);

  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    formats: ["avif", "webp", "auto"],
    widths: [480, 800, 1440],
    urlPath: "/img/",
    outputDir: "_site/img/",
    htmlOptions: {
      imgAttributes: {
        loading: "lazy",
        decoding: "async",
      },
    },
  });

  eleventyConfig.addFilter("sortByOrder", (items) =>
    [...items].sort((a, b) => a.data.order - b.data.order)
  );

  eleventyConfig.addFilter("markdown", (value) => md.render(value || ""));

  eleventyConfig.addFilter("lqip", async (src) => {
    const stats = await Image(src.replace(/^\//, ""), {
      widths: [24],
      formats: ["jpeg"],
      dryRun: true,
    });
    return `data:image/jpeg;base64,${stats.jpeg[0].buffer.toString("base64")}`;
  });

  eleventyConfig.addFilter("formatDate", (date) =>
    new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Paris",
    }).format(new Date(date))
  );

  eleventyConfig.addFilter("formatDateTime", (date) => {
    const d = new Date(date);
    const day = new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Paris",
    }).format(d);
    const time = new Intl.DateTimeFormat("fr-FR", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    })
      .format(d)
      .replace(":", "h");
    return `${day} à ${time}`;
  });

  eleventyConfig.addFilter("isoDate", (date) => new Date(date).toISOString());

  eleventyConfig.addFilter("dayNumber", (date) =>
    new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      timeZone: "Europe/Paris",
    }).format(new Date(date))
  );

  eleventyConfig.addFilter("monthShort", (date) =>
    new Intl.DateTimeFormat("fr-FR", {
      month: "short",
      timeZone: "Europe/Paris",
    })
      .format(new Date(date))
      .replace(".", "")
  );

  eleventyConfig.addFilter("upcomingEvents", (events) =>
    events
      .filter((e) => new Date(e.data.date) >= new Date())
      .sort((a, b) => new Date(a.data.date) - new Date(b.data.date))
  );

  eleventyConfig.addFilter("pastEvents", (events) =>
    events
      .filter((e) => new Date(e.data.date) < new Date())
      .sort((a, b) => new Date(b.data.date) - new Date(a.data.date))
  );

  eleventyConfig.addFilter("byDateDescending", (items) =>
    [...items].sort((a, b) => new Date(b.data.date) - new Date(a.data.date))
  );

  return {
    pathPrefix: process.env.PATH_PREFIX || "/",
    dir: {
      input: ".",
      includes: "src/_includes",
      data: "content/data",
      output: "_site",
    },
  };
}
