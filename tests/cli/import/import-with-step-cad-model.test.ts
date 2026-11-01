import { test, expect } from "bun:test"
import { getCliTestFixture } from "../../fixtures/get-cli-test-fixture"
import path from "node:path"
import fs from "node:fs"

// The test registry has no RP2040 datasheet metadata; import still retains CAD.
const missingMetadataWarning =
  "No datasheet pin attributes found for RP2040. pinAttributes may not be populated. Verify electrical pin requirements against the datasheet. Continuing with imported attributes.\n"

test("import command generates package from JLCPCB part", async () => {
  if (process.env.CI) {
    return
  }

  const { tmpDir, runCommand } = await getCliTestFixture({ loggedIn: true })
  const { stdout, stderr } = await runCommand("tsci import C2040")
  const filePath = path.join(tmpDir, "imports", "RP2040.tsx")
  expect(fs.existsSync(filePath)).toBe(true)
  const fileContent = fs.readFileSync(filePath, "utf8")
  expect(fileContent).toContain("stepUrl")
  expect(fileContent).toContain("objUrl")
  expect(fileContent).toContain('footprint="qfn56_thermalpad3.1mmx3.1mm')
  expect(fileContent).not.toContain("footprint={<footprint>")
  expect(stderr).toBe(missingMetadataWarning)
  expect(stdout.toLowerCase()).toContain("imported")
}, 20_000)

test("import --use-exact-footprint keeps the generated footprint JSX", async () => {
  if (process.env.CI) {
    return
  }

  const { tmpDir, runCommand } = await getCliTestFixture({ loggedIn: true })
  const { stderr } = await runCommand("tsci import --use-exact-footprint C2040")
  const fileContent = fs.readFileSync(
    path.join(tmpDir, "imports", "RP2040.tsx"),
    "utf8",
  )

  expect(fileContent).toContain("footprint={<footprint>")
  expect(fileContent).not.toContain('footprint="qfn56_thermalpad3.1mm')
  expect(stderr).toBe(missingMetadataWarning)
}, 20_000)
