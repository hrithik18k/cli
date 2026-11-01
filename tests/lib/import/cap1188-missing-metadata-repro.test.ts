import "bun-match-svg"
import { expect, spyOn, test } from "bun:test"
import { readFile, rm } from "node:fs/promises"
import { convertCircuitJsonToSchematicSvg } from "circuit-to-svg"
import { importComponentFromJlcpcb } from "lib/import/import-component-from-jlcpcb"
import React from "react"
import { temporaryDirectory } from "tempy"
import { Circuit } from "tscircuit"
import ts from "typescript"
import raw from "../../fixtures/assets/datasheets/C2652057.raweasy.json"

// Related merged repros: cli#5370 and easyeda-converter#577. Capture supplier
// data and mock the missing metadata response so failures cannot be network errors.
// Microchip DS00001620C, Table 2-1 (page 7), identifies Bottom Pad as GND.
// The supplier's physical footprint numbers that centre pad 25. This test must
// not infer that all generic pin25/EP pads are ground.
for (const hasMetadata of [false, true]) {
  test(`CAP1188 exposed pad ${hasMetadata ? "preserves supplied ground metadata" : "warns when metadata is missing"}`, async () => {
    const directory = temporaryDirectory()
    const warn = spyOn(console, "warn").mockImplementation(() => {})
    let datasheetRequests = 0
    const handler = async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("/datasheets/get")) {
        datasheetRequests++
        expect(url.searchParams.get("chip_name")).toBe("cap1188-1-cp-tr")
        return hasMetadata
          ? Response.json({
              datasheet: {
                chip_name: "CAP1188-1-CP-TR",
                pin_attributes: {
                  "23": { requiresPower: true },
                  "25": { requiresGround: true },
                },
              },
            })
          : Response.json(
              { error: { error_code: "datasheet_not_found" } },
              { status: 404 },
            )
      }
      if (url.pathname === "/api/components/search")
        return Response.json({
          success: true,
          result: { lists: { lcsc: [raw] } },
        })
      if (url.pathname === `/api/components/${raw.uuid}`)
        return Response.json({ success: true, result: raw })
      if (url.hostname === "modelcdn.tscircuit.com")
        return new Response(null, { status: 404 })
      throw new Error(`Unexpected fetch: ${url}`)
    }
    const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(handler, { preconnect: fetch.preconnect }),
    )
    try {
      const { filePath } = await importComponentFromJlcpcb(
        "C2652057",
        directory,
        {
          useExactFootprint: true,
        },
      )
      const source = await readFile(filePath, "utf8")
      expect(datasheetRequests).toBe(1)
      // Snapshot the generated TSX as well as the missing-metadata schematic.
      expect(source.replace(/[\t ]+$/gm, "")).toMatchSnapshot(
        hasMetadata
          ? "CAP1188 supplied metadata TSX"
          : "CAP1188 missing metadata TSX",
      )

      // Evaluate only generated code from the fixed supplier fixture above.
      const js = ts.transpileModule(source, {
        compilerOptions: {
          jsx: ts.JsxEmit.React,
          module: ts.ModuleKind.CommonJS,
        },
      }).outputText
      const module = { exports: {} as Record<string, any> }
      new Function("React", "module", "exports", js)(
        React,
        module,
        module.exports,
      )
      const Component = module.exports.CAP1188_1_CP_TR
      const circuit = new Circuit()
      circuit.add(
        React.createElement(
          "board",
          { width: 12, height: 12, routingDisabled: true },
          React.createElement(Component, { name: "U1", cadModel: null }),
        ),
      )
      await circuit.renderUntilSettled()
      const json = circuit.getCircuitJson()
      const ep = json.find(
        (e) => e.type === "source_port" && e.pin_number === 25,
      )
      const centrePad = json.find(
        (e) => e.type === "pcb_smtpad" && e.port_hints?.includes("pin25"),
      )
      expect(centrePad).toMatchObject({
        type: "pcb_smtpad",
        width: expect.closeTo(2.5, 3),
        height: expect.closeTo(2.5, 3),
      })
      expect(ep).toMatchObject({ type: "source_port", pin_number: 25 })
      expect(
        json.find((e) => e.type === "source_port" && e.pin_number === 23),
      ).toMatchObject({ requires_power: true })
      if (hasMetadata) {
        expect(ep).toMatchObject({ requires_ground: true })
        expect(warn).not.toHaveBeenCalled()
      } else {
        expect(ep).not.toHaveProperty("requires_ground")
        expect(source).toContain('pin25: ["pin25"]')
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0]![0]).toContain(
          "No datasheet pin attributes found for CAP1188-1-CP-TR",
        )
        expect(warn.mock.calls[0]![0]).toContain(
          "Verify electrical pin requirements against the datasheet",
        )
        expect(
          convertCircuitJsonToSchematicSvg(json).replace(/[\t ]+$/gm, ""),
        ).toMatchSvgSnapshot(
          import.meta.path,
          "cap1188-missing-metadata-schematic",
        )
      }
    } finally {
      fetchMock.mockRestore()
      warn.mockRestore()
      await rm(directory, { recursive: true, force: true })
    }
  }, 30_000)
}
