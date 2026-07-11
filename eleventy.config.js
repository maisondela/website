import { readdirSync } from "node:fs";
import Image, { eleventyImageTransformPlugin } from "@11ty/eleventy-img";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy("uploads");
  eleventyConfig.addPassthroughCopy("admin");

  eleventyConfig.ignores.add("admin/**");
  eleventyConfig.ignores.add("README.md");
  eleventyConfig.ignores.add("CLAUDE.md");

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

  const featuredPortraits = [
    "dsc-8446",
    "dsc-8455",
    "dsc-8465",
    "dsc-8471",
    "dsc-8478",
    "dsc-8482",
    "dsc-8498",
    "dsc-8505",
    "dsc-8528",
    "dsc-8542",
    "dsc-8546",
    "dsc-8548",
  ];
  const monoPortraits = new Set(readdirSync("media/portraits/mono"));
  const colorPortraits = new Set(readdirSync("media/portraits/color"));
  eleventyConfig.addGlobalData(
    "portraits",
    featuredPortraits
      .map((slug) => `${slug}.jpg`)
      .filter((file) => monoPortraits.has(file) && colorPortraits.has(file))
      .map((file) => ({
        mono: `/media/portraits/mono/${file}`,
        color: `/media/portraits/color/${file}`,
      }))
  );
  eleventyConfig.addGlobalData(
    "artwork",
    readdirSync("media/artwork").map((file) => `/media/artwork/${file}`)
  );

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
    dir: {
      input: ".",
      includes: "src/_includes",
      data: "content/data",
      output: "_site",
    },
  };
}
