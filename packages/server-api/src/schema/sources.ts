/** Metadata about the data sources; physical interface, address, protocol, etc. */
export type Sources = Record<
  string,
  {
    /**
     * Sources unique name e.g. [type-bus].[id], N2000-01.034
     */
    label?: string
    /**
     * Type of interface i.e. signalk, NMEA0183 or NMEA2000
     */
    type?: string
  }
> &
  Record<string, SourceData>

export type SourceData = {
  /**
   * AIS data
   */
  ais?: {
    /**
     * AIS Message Type
     */
    aisType?: number
  }
  /**
   * NMEA 0183 talker id, the GP in $GPRMC..
   */
  talker?: string
  /**
   * NMEA 0183 sentences
   */
  sentences?: {
    /**
     * RFC 3339 (UTC only without local offset) string representing date and time.
     */
    [k: string]: string
  }
  n2k?: {
    /**
     * NMEA 2000 bus
     */
    src?: string
    /**
     * NMEA 2000 pgn number
     */
    pgns?: {
      /**
       * RFC 3339 (UTC only without local offset) string representing date and time.
       */
      [k: string]: string
    }
    /**
     * Manufacturer numeric NMEA 2000 id
     */
    manufacturerId?: number
    /**
     * Manufacturer of the source device
     */
    manufacturerName?: string
    /**
     * Unique id of the source device
     */
    uniqueId?: number
    /**
     * NMEA 2000 Device Function code
     */
    deviceFunction?: number
    /**
     * NMEA 2000 Device Class code
     */
    deviceClass?: number
    /**
     * Manufactures assigned NMEA2000 Product ID
     */
    productID?: number
    /**
     * Product Name or Model Number
     */
    productName?: string
    /**
     * Version of the device's Software/Firmware
     */
    softwareVersion?: string
    /**
     * Version of the device's Hardware
     */
    hardwareVersion?: string
    /**
     * Device's Serial Number
     */
    serialNumber?: string
    /**
     * Product Installation Note 1 i.e. 'Wired on Navigation Switch/Circuit'
     */
    installationNote1?: string
    /**
     * Product Installation Note 2 i.e. 'Located under forward bunk'
     */
    installationNote2?: string
    /**
     * Manufacturer's Info i.e. 'http://digitalyachtamerica.com Tel:+44 1179 554474'
     */
    manufacturerInfo?: string
  }
}
