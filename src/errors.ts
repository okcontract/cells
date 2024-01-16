/**
 * Cell's error coming from a dependency to an other cell.
 * It has
 *  - a message that points to the culprit Cell.
 *  - the id of the source cell
 *  - the name of the source cell
 *  - the error from the source Cell
 *
 * @todo The source's Error is most certainly retained as a pointer
 *       but we should make sure of it, as it could impact performances.
 *
 */
export class CellError extends Error {
  readonly source: number;
  readonly sourceName: string;
  readonly reason: any;
  constructor(source: number, reason: any, sourceName = source.toString()) {
    super(`Cell ${sourceName} has an error: ${reason}`);
    this.source = source;
    this.sourceName = sourceName;
    this.reason = reason;
  }
}
