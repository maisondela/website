export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy("uploads");
  eleventyConfig.addPassthroughCopy("admin");

  eleventyConfig.ignores.add("admin/**");
  eleventyConfig.ignores.add("README.md");
  eleventyConfig.ignores.add("CLAUDE.md");

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
