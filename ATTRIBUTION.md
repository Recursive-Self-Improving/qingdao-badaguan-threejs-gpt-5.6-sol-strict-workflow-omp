# Attribution and provenance

## C01 asset status

C01 ships no remote runtime assets. It introduces no images, textures, models, fonts, audio, video, map data, analytics, APIs, CDNs, or hotlinked resources. The browser application foundation uses locally installed npm packages and locally authored source only. Later visual content must remain procedural or repository-hosted and must be recorded below before it is shipped.

## Procedural visual and asset baseline

The shipped baseline is procedural: required scene geometry, materials, planting, atmosphere, and other visual cues are authored locally from primitives or generated data rather than copied from, traced from, or loaded from remote imagery or models. The research sources below inform factual constraints and interpretive design decisions; their URLs are provenance references only and are never fetched by the application at runtime. Any future external asset requires local hosting and a complete ledger entry before use.

## Badaguan and authenticity research provenance

The following PLAN §16 sources establish the research basis. “Fact” identifies source-backed observations or constraints; “inference” identifies the project’s interpretive translation of those facts into a procedural scene rather than a claim of exact reconstruction.

1. Qingdao Municipal Government, “八大关风景区 / Badaguan Scenic Area” — https://www.qingdao.gov.cn/yfqd/qdwl/cjfw/wyqtsjd/202009/t20200910_521991.shtml — **Fact:** location, scale, development history, and architectural variety. **Inference purpose:** bound the scene’s extent and varied villa vocabulary.
2. Qingdao Municipal Government, “六、八大关建筑群 / Badaguan Architectural Complex” — https://www.qingdao.gov.cn/lslm/zt/whyc/wwzl/202112/t20211201_3895722.shtml — **Fact:** road arrangement, villas, gardens, materials, and architectural styles. **Inference purpose:** guide the procedural street hierarchy, setbacks, garden parcels, and material palette.
3. Qingdao Municipal Government, “Badaguan–Taipingshan Detailed Control Plan Approval” — https://www.qingdao.gov.cn/zwgk/zdgk/ghjh/gtkjgh022/202010/t20201016_350088.shtml — **Fact:** natural character, historic pattern, sight corridors, grid, coastline, greenery, and open space. **Inference purpose:** shape view corridors, massing, vegetation density, and the relationship between streets and coast.
4. Qingdao Municipal Government, “Historic Conservation Management Notice” — https://www.qingdao.gov.cn/zwgk/zdgk/fgwj/zcwj/szfgw/2013/qzbf_131/202010/t20201019_497234.shtml — **Fact:** conservation guidance concerning walls, greenery, façades, and restrained advertising; treated as conservation intent because the notice states an older validity period. **Inference purpose:** keep boundaries, façades, signage, and streetscape treatment visually restrained.
5. China Meteorological Administration, “青岛地理气候特点 / Qingdao Geographic and Climate Characteristics” — https://www.cma.gov.cn/2011xzt/2014zt/20140417/2014041705/201404/t20140417_243735.html — **Fact:** maritime climate, humidity, wind, rain, fog, and autumn conditions. **Inference purpose:** inform the authored early-autumn atmosphere, haze, lighting, and foliage response.
6. Travel China / PRC Ministry of Culture and Tourism, “Badaguan” — https://www.travelchina.org.cn/en/article/bB83l6CBMthE — **Fact:** seasonal planting and landmark cues. **Inference purpose:** select recognizable planting rhythms and landmark silhouettes without reproducing source media.
7. Qingdao Daily, “红瓦绿树、青山碧海 / Red Tiles, Green Trees, Blue Mountains and Sea” — https://epaper.qingdaonews.com/html/qdrb/20200901/qdrb1357485.html — **Fact:** slope, roads, planting traditions, setbacks, silhouettes, and coastal context. **Inference purpose:** guide terrain impression, roof-and-canopy contrast, building spacing, and coastal framing.
8. Qingdao Municipal Cultural Relics Bureau, “Badaguan Architectural Complex Heritage Photo Page” — https://www.qingdao.gov.cn/lslm/zt/whyc/wwzl/202111/t20211129_3882608.shtml — **Fact:** official visual reference for the complex and landmarks. **Inference purpose:** calibrate broad proportions, colors, and silhouette cues only; no image is copied or delivered as an asset.
9. Qingdao Seaside Scenic Area, “Supporting Description” — https://www.qdseaside.cn/mobile/about.asp?id=1 — **Fact:** supporting description of the seaside scenic context; direct retrieval may have certificate limitations. **Inference purpose:** corroborate the procedural relationship among coast, greenery, and visitor routes without making the site a runtime dependency.

## Software dependencies

| Package | Version | Role | License | Publisher / author | Canonical source | Runtime delivery |
|---|---:|---|---|---|---|---|
| `three` | 0.185.1 | Browser 3D runtime | MIT | three.js authors | https://github.com/mrdoob/three.js | Bundled locally by Vite |
| `@playwright/test` | 1.61.1 | Browser and visual test runner | Apache-2.0 | Microsoft Corporation | https://github.com/microsoft/playwright | Development only |
| `@types/node` | 24.13.3 | Node.js type declarations | MIT | DefinitelyTyped contributors | https://github.com/DefinitelyTyped/DefinitelyTyped | Development only |
| `@types/three` | 0.185.1 | Three.js type declarations | MIT | DefinitelyTyped contributors | https://github.com/DefinitelyTyped/DefinitelyTyped | Development only |
| `typescript` | 7.0.2 | Static type checker and compiler | Apache-2.0 | Microsoft Corporation | https://github.com/microsoft/TypeScript | Development only |
| `vite` | 8.1.4 | Development server and production bundler | MIT | Vite contributors | https://github.com/vitejs/vite | Development only |
| `vitest` | 4.1.10 | Unit test runner | MIT | Vitest contributors | https://github.com/vitest-dev/vitest | Development only |

Transitive npm packages and integrity hashes are recorded reproducibly in `package-lock.json`. Package licenses remain governed by their upstream distributions.

## Ledger fields for later assets

Every externally sourced asset added in a later chunk must record all of the following before use:

- asset name and repository destination;
- asset type and in-product purpose;
- original author or publisher;
- canonical source URL;
- exact license name, version, and license URL;
- retrieval date;
- original filename and checksum;
- modifications, conversions, or optimization performed;
- attribution text required in-product or in distribution;
- whether the asset is required or optional and its procedural or neutral fallback;
- reviewer confirmation that commercial redistribution and local hosting are permitted.

Assets with unclear provenance or incompatible terms must not be added. Production assets must be stored locally rather than hotlinked.
