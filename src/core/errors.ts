/** 项目 YAML 的 schemaVersion 超出当前编辑器可读范围 */
export class UnsupportedSchemaError extends Error {
  readonly name = "UnsupportedSchemaError";

  constructor(message = "schemaVersion 高于编辑器支持范围") {
    super(message);
  }
}
