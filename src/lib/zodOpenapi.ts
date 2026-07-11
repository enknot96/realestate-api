import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// zodのスキーマに.openapi()メソッドを生やす副作用。openapi.tsやschemas/*.tsより先に読み込まれる必要がある
extendZodWithOpenApi(z);
