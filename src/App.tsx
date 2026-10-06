import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Archive,
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Grid2X2,
  Plus,
  Search,
  Signature,
  X,
} from "lucide-react";
import { api, dateLabel, money } from "./api";
import { Dialog } from "./Dialog";

type Document = {
  id: string;
  number: string;
  title: string;
  type: string;
  section: string;
  counterparty: string;
  date: string;
  amount_minor: number;
  responsible: string;
  status: string;
};
type Event = { description: string; created_at: string };
const statuses: Record<string, string> = {
  draft: "Черновик",
  review: "На согласовании",
  signed: "Подписан",
  archived: "В архиве",
};
const types: Record<string, string> = {
  contract: "Договор",
  invoice: "Счёт",
  act: "Акт",
  letter: "Письмо",
};
const sections: Record<string, string> = {
  all: "Все документы",
  client: "Клиенты",
  supplier: "Поставщики",
  internal: "Внутренние",
};

export function App() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("all");
  const [status, setStatus] = useState("all");
  const [archive, setArchive] = useState(false);
  const [selected, setSelected] = useState<Document | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => {
    setSelected(null);
    setCreating(false);
    setError("");
  }, []);
  async function load() {
    try {
      setDocuments(await api<Document[]>("/documents"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function open(document: Document) {
    setSelected(document);
    setEvents([]);
    try {
      setEvents(await api<Event[]>("/documents/" + document.id + "/events"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function changeStatus(value: string) {
    if (!selected) return;
    setBusy(true);
    try {
      const document = await api<Document>("/documents/" + selected.id, {
        method: "PATCH",
        body: JSON.stringify({ status: value }),
      });
      setSelected(document);
      setDocuments((d) => d.map((x) => (x.id === document.id ? document : x)));
      setEvents(await api<Event[]>("/documents/" + document.id + "/events"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fields = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const document = await api<Document>("/documents", {
        method: "POST",
        body: JSON.stringify({
          ...fields,
          amount_minor: Math.round(Number(fields.amount) * 100),
        }),
      });
      setDocuments((d) => [document, ...d]);
      setCreating(false);
      setSelected(document);
      setArchive(false);
      setSection("all");
      setStatus("all");
      setSearch("");
      setEvents(await api<Event[]>("/documents/" + document.id + "/events"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const active = documents.filter((d) => d.status !== "archived");
  const visible = documents.filter(
    (d) =>
      (archive ? d.status === "archived" : d.status !== "archived") &&
      (section === "all" || d.section === section) &&
      (status === "all" || d.status === status) &&
      (d.title + " " + d.number + " " + d.counterparty)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <FileText size={20} />
          </span>
          docledger
        </a>
        <div className="workspace">
          <span className="avatar">К</span>
          <div>
            <b>Команда</b>
            <small>Рабочее пространство</small>
          </div>
        </div>
        <nav aria-label="Разделы реестра">
          <p className="nav-label">Документы</p>
          {Object.entries(sections).map(([key, label]) => (
            <button
              key={key}
              className={!archive && section === key ? "selected" : ""}
              onClick={() => {
                setSection(key);
                setArchive(false);
                setStatus("all");
              }}
            >
              {key === "all" ? <Grid2X2 size={18} /> : <Folder size={18} />}
              <span>{label}</span>
              <small>
                {
                  active.filter((d) => key === "all" || d.section === key)
                    .length
                }
              </small>
            </button>
          ))}
          <button
            className={archive ? "selected" : ""}
            onClick={() => {
              setArchive(true);
              setSection("all");
              setStatus("all");
            }}
          >
            <Archive size={18} />
            <span>Архив</span>
            <small>{documents.length - active.length}</small>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="avatar person">АМ</span>
          <div>
            <b>Анна Миронова</b>
            <small>Менеджер документов</small>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Рабочее пространство <ChevronRight size={15} /> Документы
          </span>
          <span className="top-avatar">АМ</span>
        </header>
        <div className="page">
          <div className="page-heading">
            <div>
              <h1>{archive ? "Архив" : sections[section]}</h1>
              <p>Договоры, счета и акты в одном реестре</p>
            </div>
            <button
              className="primary"
              onClick={() => {
                setCreating(true);
                setError("");
              }}
            >
              <Plus size={18} />
              Новый документ
            </button>
          </div>
          <div className="summary">
            <div>
              <FolderOpen size={22} />
              <p>
                <strong>{active.length}</strong>
                <span>В работе</span>
              </p>
            </div>
            <div>
              <Signature size={22} />
              <p>
                <strong>
                  {active.filter((d) => d.status === "review").length}
                </strong>
                <span>Ожидают согласования</span>
              </p>
            </div>
            <div>
              <FileText size={22} />
              <p>
                <strong>
                  {active.filter((d) => d.status === "signed").length}
                </strong>
                <span>Подписаны</span>
              </p>
            </div>
          </div>
          <section className="register" aria-label="Реестр документов">
            <div className="toolbar">
              <label className="search">
                <Search size={18} />
                <input
                  aria-label="Поиск документов"
                  placeholder="Название, номер или контрагент"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="icon-button"
                    aria-label="Очистить поиск"
                    onClick={() => setSearch("")}
                  >
                    <X size={15} />
                  </button>
                )}
              </label>
              <label className="filter">
                <select
                  aria-label="Статус документа"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">Все статусы</option>
                  {Object.entries(statuses)
                    .filter(([s]) =>
                      archive ? s === "archived" : s !== "archived",
                    )
                    .map(([s, name]) => (
                      <option key={s} value={s}>
                        {name}
                      </option>
                    ))}
                </select>
                <ChevronDown size={14} />
              </label>
              <a className="export" href="/api/documents/export" download>
                <ArrowDownToLine size={17} />
                <span>Экспорт</span>
              </a>
            </div>
            {error && !selected && !creating && (
              <p role="alert" className="error">
                {error} <button onClick={() => void load()}>Повторить</button>
              </p>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Документ</th>
                    <th>Контрагент</th>
                    <th>Дата</th>
                    <th>Сумма</th>
                    <th>Статус</th>
                    <th>
                      <span className="sr-only">Открыть</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <button
                          className="document-link"
                          onClick={() => void open(d)}
                        >
                          <span className={"file-icon " + d.type}>
                            <FileText size={20} />
                          </span>
                          <span>
                            <b>{d.title}</b>
                            <small>
                              {d.number} / {types[d.type]}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>{d.counterparty}</td>
                      <td className="muted">{dateLabel(d.date)}</td>
                      <td className="numeric">
                        {d.amount_minor ? (
                          money(d.amount_minor)
                        ) : (
                          <span className="muted">Без суммы</span>
                        )}
                      </td>
                      <td>
                        <span className={"badge " + d.status}>
                          {statuses[d.status]}
                        </span>
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={"Открыть " + d.number}
                          onClick={() => void open(d)}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!visible.length && (
              <div className="empty">
                <FileText size={28} />
                <h3>
                  {loading ? "Загружаем документы" : "Документы не найдены"}
                </h3>
                <p>
                  {loading
                    ? "Подключаемся к реестру"
                    : "Измените условия поиска или добавьте документ"}
                </p>
              </div>
            )}
            <footer className="table-footer">
              <span>Документов: {visible.length}</span>
              <span>
                Сумма по выборке{" "}
                <b>{money(visible.reduce((n, d) => n + d.amount_minor, 0))}</b>
              </span>
            </footer>
          </section>
          <p className="page-note">
            <span className="live-dot" />
            Изменения сохраняются в реестре
          </p>
        </div>
      </main>
      {(creating || selected) && (
        <Dialog
          title={creating ? "Новый документ" : selected!.title}
          close={close}
        >
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {creating ? (
            <form onSubmit={create}>
              <label>
                Название
                <input
                  name="title"
                  required
                  minLength={3}
                  maxLength={180}
                  autoFocus
                  placeholder="Например, договор на разработку"
                />
              </label>
              <div className="form-row">
                <label>
                  Тип
                  <select name="type">
                    {Object.entries(types).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Раздел
                  <select name="section">
                    {Object.entries(sections)
                      .filter(([key]) => key !== "all")
                      .map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <label>
                Контрагент
                <input
                  name="counterparty"
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>
              <div className="form-row">
                <label>
                  Дата
                  <input
                    type="date"
                    name="date"
                    defaultValue="2026-10-06"
                    required
                  />
                </label>
                <label>
                  Сумма, ₽
                  <input
                    type="number"
                    name="amount"
                    min="0"
                    max="1000000"
                    step="0.01"
                    defaultValue="0"
                    required
                  />
                </label>
              </div>
              <label>
                Ответственный
                <input
                  name="responsible"
                  defaultValue="Анна Миронова"
                  required
                  minLength={2}
                />
              </label>
              <div className="form-actions">
                <button type="button" className="secondary" onClick={close}>
                  Отмена
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? "Сохраняем" : "Добавить документ"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="record-meta">
                <span className={"badge " + selected!.status}>
                  {statuses[selected!.status]}
                </span>
                <span>{selected!.number}</span>
              </div>
              <dl>
                <div>
                  <dt>Контрагент</dt>
                  <dd>{selected!.counterparty}</dd>
                </div>
                <div>
                  <dt>Тип / раздел</dt>
                  <dd>
                    {types[selected!.type]} / {sections[selected!.section]}
                  </dd>
                </div>
                <div>
                  <dt>Дата</dt>
                  <dd>{dateLabel(selected!.date)}</dd>
                </div>
                <div>
                  <dt>Сумма</dt>
                  <dd>{money(selected!.amount_minor)}</dd>
                </div>
                <div>
                  <dt>Ответственный</dt>
                  <dd>{selected!.responsible}</dd>
                </div>
              </dl>
              <label className="status-control">
                Статус
                <select
                  disabled={busy}
                  aria-label="Изменить статус"
                  value={selected!.status}
                  onChange={(e) => void changeStatus(e.target.value)}
                >
                  {Object.entries(statuses).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <h3 className="history-title">История документа</h3>
              <ol className="history">
                {events.map((event, i) => (
                  <li key={i}>
                    <span>{event.description}</span>
                    <small>
                      {new Date(event.created_at).toLocaleString("ru-RU")}
                    </small>
                  </li>
                ))}
              </ol>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}
