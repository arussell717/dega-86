import tailwindPlugin from "bun-plugin-tailwind";
await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  minify: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [tailwindPlugin],
});
console.log("built");
