
rm -rf assets.ts
deno run --allow-read https://deno.land/x/asset_builder/asset_builder.ts --import-file "asset_config.json" >> assets.ts
