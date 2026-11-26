// The storage module's public interface: the library and where it is kept.
export { openLibrary, HISTORY_LIMIT } from './library.ts';
export type {
  CommandResult, DumpExportResult, DumpFile, SyxExportResult, KeepResult, KeptDumpInfo, ExportFile, ExportResult, ImportInspection, ImportPlacement, ImportResult, ControlAddress, ControlArea, Clip, CopyResult, CopySource, GroupAddress, ControlProperty, Library, LibraryState, OpenOptions, Opened, AnyControl, SaveStatus, Selection, SelectionChange,
} from './library.ts';
export type { LibraryStorage, StoredDump } from './storage.ts';
export { StorageBusyError } from './storage.ts';
export { memoryStorage } from './memoryStorage.ts';
export type { MemoryStorage } from './memoryStorage.ts';
export { indexedDbStorage, indexedDbAvailable } from './indexedDbStorage.ts';
export type { ExportState, SetupSummary } from './libraryInfo.ts';
export { UNREADABLE_TEXT } from './dumpImport.ts';
export type { SyxRefusal } from './syxExport.ts';
export { NEED_TEXT, hasWorkToClear } from './keptDumpPlan.ts';
export type { ClearEntry, ClearPlan, DumpNeed, KeepReason, NeedReason } from './keptDumpPlan.ts';
export { CHANGES_SHOWN } from './sendPlan.ts';
export type { SendBase, SendBackup, SendChanges, SendPlan, SendRefusal } from './sendPlan.ts';
export type { RestoreAgainst, RestorePlan, RestoreRefusal, SentInfo } from './restorePlan.ts';