import { fetchDatasheet } from "./fetch-datasheet"

export const fetchDatasheetMetadata = async (
  manufacturerPartNumber: string | null | undefined,
) => {
  if (!manufacturerPartNumber || !/[a-z0-9]/i.test(manufacturerPartNumber))
    return undefined

  const signal = AbortSignal.timeout(5_000)
  try {
    const datasheet = await fetchDatasheet(manufacturerPartNumber, signal)
    if (
      !datasheet?.pin_attributes ||
      Object.keys(datasheet.pin_attributes).length === 0
    ) {
      console.warn(
        `No datasheet pin attributes found for ${manufacturerPartNumber}. pinAttributes may not be populated. Verify electrical pin requirements against the datasheet. Continuing with imported attributes.`,
      )
    }
    if (!datasheet) return undefined
    return {
      pinAttributes: datasheet.pin_attributes ?? undefined,
      internallyConnectedPins: datasheet.internally_connected_pins ?? undefined,
    }
  } catch (error) {
    const message =
      signal.aborted ||
      (error instanceof Error && error.name === "TimeoutError")
        ? `Datasheet API did not respond within 5 seconds for ${manufacturerPartNumber}`
        : `Could not load datasheet pin attributes for ${manufacturerPartNumber}: ${error instanceof Error ? error.message : "request failed"}`
    console.warn(
      `${message}. pinAttributes may not be populated. Continuing with imported attributes.`,
    )
    return undefined
  }
}

/** Compatibility helper for callers requesting only electrical attributes. */
export const fetchDatasheetPinAttributes = async (
  manufacturerPartNumber: string | null | undefined,
) => (await fetchDatasheetMetadata(manufacturerPartNumber))?.pinAttributes
