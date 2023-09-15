// This file generates "internal/compat/css_table.go"

import fs = require('fs')
import { Engine, CSSFeature, VersionRange, VersionRangeMap, CSSPrefixMap, PrefixData, CSSProperty } from './index'

const cssFeatureString = (feature: string): string => {
  return feature.replace(/([A-Z]+)/g, '-$1').slice(1).toLowerCase().replace(/[-_]+/g, '-')
}

const simpleMap = (entries: [string, string][]) => {
  let maxLength = 0
  for (const [key] of entries) {
    maxLength = Math.max(maxLength, key.length + 1)
  }
  return entries.map(([key, value]) => `\t${(key + ':').padEnd(maxLength)} ${value},`).join('\n')
}

const compareEngines = (a: Engine, b: Engine): number => {
  const lowerA = a.toLowerCase()
  const lowerB = b.toLowerCase()
  return lowerA < lowerB ? -1 : lowerA > lowerB ? 1 : 0
}

const cssTableMap = (map: Partial<Record<Engine, VersionRange[]>>) => {
  const engineKeys = (Object.keys(map) as Engine[]).sort(compareEngines)
  const maxLength = engineKeys.reduce((a, b) => Math.max(a, b.length + 1), 0)
  if (engineKeys.length === 0) return '{}'
  return `{\n${engineKeys.map(engine => {
    const items = map[engine]!.map(range => {
      return `{start: v{${range.start.concat(0, 0).slice(0, 3).join(', ')
        }}${range.end ? `, end: v{${range.end.concat(0, 0).slice(0, 3).join(', ')}}` : ''}}`
    })
    return `\t\t${(engine + ':').padEnd(maxLength)} {${items.join(', ')}},`
  }).join('\n')}\n\t}`
}

const cssPrefixName = (prefix: string): string => {
  return prefix[0].toUpperCase() + prefix.slice(1) + 'Prefix'
}

const cssPrefixMap = (entries: PrefixData[]) => {
  if (entries.length === 0) return '{}'
  entries.sort((a, b) => compareEngines(a.engine, b.engine))
  return `{\n${entries.map(({ engine, prefix, withoutPrefix }) => {
    const version = withoutPrefix && withoutPrefix.concat(0, 0).slice(0, 3).join(', ')
    return `\t\t{engine: ${engine}, prefix: ${cssPrefixName(prefix)}${version ? `, withoutPrefix: v{${version}}` : ''}},`
  }).join('\n')}\n\t}`
}

const generatedByComment = `// This file was automatically generated by "css_table.ts"`

export const generateTableForCSS = (map: VersionRangeMap<CSSFeature>, prefixes: CSSPrefixMap): void => {
  const prefixNames = new Set<string>()
  for (const property in prefixes) {
    for (const { prefix } of prefixes[property as CSSProperty]!) {
      prefixNames.add(cssPrefixName(prefix))
    }
  }

  fs.writeFileSync(__dirname + '/../internal/compat/css_table.go',
    `${generatedByComment}

package compat

import (
\t"github.com/evanw/esbuild/internal/css_ast"
)

type CSSFeature uint8

const (
${Object.keys(map).sort().map((feature, i) => `\t${feature}${i ? '' : ' CSSFeature = 1 << iota'}`).join('\n')}
)

var StringToCSSFeature = map[string]CSSFeature{
${simpleMap(Object.keys(map).sort().map(feature => [`"${cssFeatureString(feature)}"`, feature]))}
}

func (features CSSFeature) Has(feature CSSFeature) bool {
\treturn (features & feature) != 0
}

func (features CSSFeature) ApplyOverrides(overrides CSSFeature, mask CSSFeature) CSSFeature {
\treturn (features & ^mask) | (overrides & mask)
}

var cssTable = map[CSSFeature]map[Engine][]versionRange{
${Object.keys(map).sort().map(feature => `\t${feature}: ${cssTableMap(map[feature as CSSFeature]!)},`).join('\n')}
}

// Return all features that are not available in at least one environment
func UnsupportedCSSFeatures(constraints map[Engine]Semver) (unsupported CSSFeature) {
\tfor feature, engines := range cssTable {
\t\tif feature == InlineStyle {
\t\t\tcontinue // This is purely user-specified
\t\t}
\t\tfor engine, version := range constraints {
\t\t\tif !engine.IsBrowser() {
\t\t\t\t// Specifying "--target=es2020" shouldn't affect CSS
\t\t\t\tcontinue
\t\t\t}
\t\t\tif versionRanges, ok := engines[engine]; !ok || !isVersionSupported(versionRanges, version) {
\t\t\t\tunsupported |= feature
\t\t\t}
\t\t}
\t}
\treturn
}

type CSSPrefix uint8

const (
${[...prefixNames].sort().map((name, i) => `\t${name}${i ? '' : ' CSSPrefix = 1 << iota'}`).join('\n')}

\tNoPrefix CSSPrefix = 0
)

type prefixData struct {
\t// Note: In some cases, earlier versions did not require a prefix but later
\t// ones do. This is the case for Microsoft Edge for example, which switched
\t// the underlying browser engine from a custom one to the one from Chrome.
\t// However, we assume that users specifying a browser version for CSS mean
\t// "works in this version or newer", so we still add a prefix when a target
\t// is an old Edge version.
\tengine        Engine
\twithoutPrefix v
\tprefix        CSSPrefix
}

var cssPrefixTable = map[css_ast.D][]prefixData{
${Object.keys(prefixes).sort().map(property => `\tcss_ast.${property}: ${cssPrefixMap(prefixes[property as CSSProperty]!)},`).join('\n')}
}

func CSSPrefixData(constraints map[Engine]Semver) (entries map[css_ast.D]CSSPrefix) {
\tfor property, items := range cssPrefixTable {
\t\tprefixes := NoPrefix
\t\tfor engine, version := range constraints {
\t\t\tif !engine.IsBrowser() {
\t\t\t\t// Specifying "--target=es2020" shouldn't affect CSS
\t\t\t\tcontinue
\t\t\t}
\t\t\tfor _, item := range items {
\t\t\t\tif item.engine == engine && (item.withoutPrefix == v{} || compareVersions(item.withoutPrefix, version) > 0) {
\t\t\t\t\tprefixes |= item.prefix
\t\t\t\t}
\t\t\t}
\t\t}
\t\tif prefixes != NoPrefix {
\t\t\tif entries == nil {
\t\t\t\tentries = make(map[css_ast.D]CSSPrefix)
\t\t\t}
\t\t\tentries[property] = prefixes
\t\t}
\t}
\treturn
}
`)
}
