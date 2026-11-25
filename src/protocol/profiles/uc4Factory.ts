// The factory SndA of the UC4 (firmware 02.05) as bytes: the generated memory image (uc4FactoryImage.ts) wrapped
// in the frame the device writes. Tested against tests/fixtures/sysex/factory-SndA.syx, byte for byte.
import { RECORD_DATA_LENGTH, RECORD_PADDING, writeFrame, type DumpRecord, type ParsedFrame } from '../frame.ts';
import { FACTORY_IMAGE_BASE64, FACTORY_IMAGE_START } from './uc4FactoryImage.ts';

/** Header of a SndA of firmware 02.05: device 06, message 03 (SndA), firmware 02 05. */
const HEADER = [6, 3, 2, 5];
const TRAILER = 6;

export function buildFactoryDump(): Uint8Array {
  const image = Uint8Array.from(atob(FACTORY_IMAGE_BASE64), (c) => c.charCodeAt(0));
  const records: DumpRecord[] = [];
  for (let off = 0; off < image.length; off += RECORD_DATA_LENGTH) {
    const data = image.slice(off, off + RECORD_DATA_LENGTH);
    let sum = 0;
    for (const v of data) sum = (sum + v) & 0xffff;
    records.push({ address: FACTORY_IMAGE_START + off, data, sumInDump: sum, sumComputed: sum, sumOk: true, frameOffset: 0, paddingAfter: RECORD_PADDING });
  }
  const frame: ParsedFrame = { header: HEADER, records, trailer: TRAILER, strayPadding: 0, lossless: true };
  return writeFrame(frame);
}
