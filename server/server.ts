import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import pg from "pg";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
const route =
  (f: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(f(req, res)).catch(next);
  };
const idSchema = z.string().uuid();
const csvCell = (value: unknown) => {
  let text = String(value ?? "");
  if (/^[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};

const docSchema = z.object({
  title: z.string().trim().min(3).max(180),
  type: z.enum(["contract", "invoice", "act", "letter"]),
  section: z.enum(["client", "supplier", "internal"]),
  counterparty: z.string().trim().min(2).max(120),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v,
      "Date",
    ),
  amount_minor: z.number().int().min(0).max(100000000),
  responsible: z.string().trim().min(2).max(80),
});
const statusSchema = z.object({
  status: z.enum(["draft", "review", "signed", "archived"]),
});
async function init() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS documents(id uuid PRIMARY KEY,number text NOT NULL,title text NOT NULL,type text NOT NULL,section text NOT NULL,counterparty text NOT NULL,date date NOT NULL,amount_minor bigint NOT NULL,responsible text NOT NULL,status text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());CREATE TABLE IF NOT EXISTS document_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,document_id uuid NOT NULL REFERENCES documents(id),description text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`,
  );
  const seeds = [
    [
      "Договор на разработку сайта",
      "contract",
      "client",
      "Студия «Север»",
      "2026-10-05",
      24000000,
      "Анна Миронова",
      "signed",
    ],
    [
      "Счёт на поставку мебели",
      "invoice",
      "supplier",
      "Мастерская «Линия»",
      "2026-10-04",
      4380000,
      "Михаил Орлов",
      "review",
    ],
    [
      "Акт выполненных работ",
      "act",
      "client",
      "Бюро «Контур»",
      "2026-10-03",
      12500000,
      "Анна Миронова",
      "review",
    ],
    [
      "Соглашение о сопровождении",
      "contract",
      "client",
      "Команда «Маяк»",
      "2026-10-02",
      8500000,
      "Елена Белова",
      "draft",
    ],
    [
      "Письмо по условиям поставки",
      "letter",
      "supplier",
      "Мастерская «Линия»",
      "2026-10-01",
      0,
      "Михаил Орлов",
      "signed",
    ],
    [
      "Акт приёмки оборудования",
      "act",
      "internal",
      "Демо-компания",
      "2026-09-30",
      7200000,
      "Елена Белова",
      "signed",
    ],
    [
      "Счёт на обслуживание",
      "invoice",
      "client",
      "Студия «Север»",
      "2026-09-29",
      6500000,
      "Анна Миронова",
      "draft",
    ],
    [
      "Договор на дизайн интерфейса",
      "contract",
      "client",
      "Бюро «Контур»",
      "2026-09-28",
      18000000,
      "Анна Миронова",
      "signed",
    ],
    [
      "Архивный акт за август",
      "act",
      "internal",
      "Демо-компания",
      "2026-08-31",
      3500000,
      "Елена Белова",
      "archived",
    ],
  ];
  for (const [i, row] of seeds.entries()) {
    const id = `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    const result = await pool.query(
      `INSERT INTO documents(id,number,title,type,section,counterparty,date,amount_minor,responsible,status)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)ON CONFLICT(id)DO NOTHING`,
      [id, `Д-${String(i + 1).padStart(3, "0")}`, ...row],
    );
    if (result.rowCount)
      await pool.query(
        `INSERT INTO document_events(document_id,description)VALUES($1,$2)`,
        [id, "Документ добавлен в реестр"],
      );
  }
}
const normalize = (r: Record<string, unknown>) => ({
  ...r,
  amount_minor: Number(r.amount_minor),
  date: String(
    r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
  ),
});
app.get(
  "/api/documents",
  route(async (req, res) => {
    const search = z
      .string()
      .max(200)
      .parse(String(req.query.search || ""));
    const result = await pool.query(
      `SELECT *,to_char(date,'YYYY-MM-DD')AS date FROM documents WHERE title ILIKE $1 OR counterparty ILIKE $1 OR number ILIKE $1 ORDER BY documents.date DESC,id`,
      ["%" + search + "%"],
    );
    res.json(result.rows.map(normalize));
  }),
);
app.get(
  "/api/documents/export",
  route(async (_req, res) => {
    const result = await pool.query(
      `SELECT number,title,counterparty,to_char(date,'YYYY-MM-DD') AS date,amount_minor,status FROM documents ORDER BY date DESC`,
    );
    const rows = result.rows.map((r) => [
      r.number,
      r.title,
      r.counterparty,
      r.date,
      Number(r.amount_minor) / 100,
      r.status,
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="documents.csv"',
    );
    res.send(
      "\ufeff" +
        [
          ["Номер", "Название", "Контрагент", "Дата", "Сумма", "Статус"],
          ...rows,
        ]
          .map((row) => row.map(csvCell).join(";"))
          .join("\r\n"),
    );
  }),
);
app.post(
  "/api/documents",
  route(async (req, res) => {
    const data = docSchema.parse(req.body);
    const id = randomUUID();
    const number = "Д-" + id.slice(0, 6).toUpperCase();
    const client = await pool.connect();
    try {
      await client.query(`BEGIN`);
      const result = await client.query(
        `INSERT INTO documents(id,number,title,type,section,counterparty,date,amount_minor,responsible,status)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft')RETURNING *,to_char(date,'YYYY-MM-DD')AS date`,
        [
          id,
          number,
          data.title,
          data.type,
          data.section,
          data.counterparty,
          data.date,
          data.amount_minor,
          data.responsible,
        ],
      );
      await client.query(
        `INSERT INTO document_events(document_id,description)VALUES($1,$2)`,
        [id, "Документ добавлен в реестр"],
      );
      await client.query(`COMMIT`);
      res.status(201).json(normalize(result.rows[0]));
    } catch (e) {
      await client.query(`ROLLBACK`);
      throw e;
    } finally {
      client.release();
    }
  }),
);
app.get(
  "/api/documents/:id/events",
  route(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    res.json(
      (
        await pool.query(
          `SELECT description,created_at FROM document_events WHERE document_id=$1 ORDER BY id DESC`,
          [id],
        )
      ).rows,
    );
  }),
);
app.patch(
  "/api/documents/:id",
  route(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const { status } = statusSchema.parse(req.body);
    const client = await pool.connect();
    try {
      await client.query(`BEGIN`);
      const current = await client.query(
        `SELECT status FROM documents WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!current.rowCount) {
        await client.query(`ROLLBACK`);
        res.status(404).json({ error: "Документ не найден" });
        return;
      }
      const result = await client.query(
        `UPDATE documents SET status=$1,updated_at=now() WHERE id=$2 RETURNING *,to_char(date,'YYYY-MM-DD')AS date`,
        [status, id],
      );
      if (current.rows[0].status !== status)
        await client.query(
          `INSERT INTO document_events(document_id,description)VALUES($1,$2)`,
          [
            id,
            "Изменён статус: " +
              {
                draft: "Черновик",
                review: "На согласовании",
                signed: "Подписан",
                archived: "В архиве",
              }[status],
          ],
        );
      await client.query(`COMMIT`);
      res.json(normalize(result.rows[0]));
    } catch (e) {
      await client.query(`ROLLBACK`);
      throw e;
    } finally {
      client.release();
    }
  }),
);

app.get(
  "/api/health",
  route(async (_req, res) => {
    await pool.query(`SELECT 1`);
    res.json({ status: "ok" });
  }),
);
app.use(express.static(resolve("dist")));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "Не найдено" });
    return;
  }
  res.sendFile(resolve("dist/index.html"));
});
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: "Некорректный JSON" });
    return;
  }
  if (error instanceof z.ZodError) {
    res
      .status(400)
      .json({
        error: "Проверьте заполнение полей",
        fields: error.issues.map((i) => i.path.join(".")),
      });
    return;
  }
  console.error(error instanceof Error ? error.message : "Request failed");
  res.status(500).json({ error: "Не удалось выполнить операцию" });
});
await init();
const server = app.listen(
  Number(process.env.PORT || 3000),
  process.env.HOST || "127.0.0.1",
  () => console.log("docledger ready"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  });
