import {
  useState,
  type FormEvent,
} from "react";

import {
  useQuery,
} from "@tanstack/react-query";

import type {
  AuditEvent,
} from "@velora/contracts";

import {
  Notice,
} from "../../shared/feedback/Notice";

import {
  auditApi,
  type AuditSearchInput,
} from "./auditApi";

import "./audit.css";

const CATEGORY_LABELS:
  Record<
    string,
    string
  > = {
    ADMIN:
      "Administración",
    CATALOG:
      "Catálogo",
    INVENTORY:
      "Inventario",
    ORDERS:
      "Pedidos",
    PAYMENTS:
      "Pagos",
    POS:
      "POS y caja",
    TRY_ON:
      "Probador virtual",
    REPORTS_AI:
      "Reportes e IA",
    PUSH:
      "Notificaciones",
    CUSTOMER:
      "Cliente",
    OTHER:
      "Otros",
  };

function actorLabel(
  event:
    AuditEvent,
): string {
  return (
    event.actorName
      ?.trim() ||
    event.actorEmail
      ?.trim() ||
    (
      event.actorUserId
        ? "Usuario autenticado"
        : "Sistema / anónimo"
    )
  );
}

function methodLabel(
  method:
    string,
): string {
  switch (
    method
  ) {
    case "POST":
      return "Crear / ejecutar";
    case "PUT":
      return "Actualizar";
    case "PATCH":
      return "Modificar";
    case "DELETE":
      return "Eliminar";
    default:
      return method;
  }
}

function toIso(
  value:
    string,
  endOfDay =
    false,
): string |
null {
  const normalized =
    value.trim();

  if (
    !normalized
  ) {
    return null;
  }

  const parsed =
    new Date(
      `${normalized}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return null;
  }

  return parsed
    .toISOString();
}

const initialFilters = {
  q:
    "",
  role:
    "",
  category:
    "",
  method:
    "",
  success:
    "",
  from:
    "",
  to:
    "",
  size:
    "25",
};

export function AuditPage() {
  const [
    form,
    setForm,
  ] =
    useState(
      initialFilters,
    );

  const [
    applied,
    setApplied,
  ] =
    useState(
      initialFilters,
    );

  const [
    page,
    setPage,
  ] =
    useState(
      0,
    );

  const queryInput:
    AuditSearchInput =
    {
      q:
        applied.q,
      role:
        applied.role,
      category:
        applied.category,
      method:
        applied.method,
      success:
        applied.success ===
        "true"
          ? true
          : applied.success ===
              "false"
            ? false
            : null,
      from:
        toIso(
          applied.from,
        ),
      to:
        toIso(
          applied.to,
          true,
        ),
      page,
      size:
        Number(
          applied.size,
        ) ||
        25,
    };

  const events =
    useQuery({
      queryKey: [
        "audit",
        queryInput,
      ],
      queryFn:
        () =>
          auditApi
            .search(
              queryInput,
            ),
    });

  const update = (
    key:
      keyof typeof form,
    value:
      string,
  ) => {
    setForm(
      (
        current,
      ) => ({
        ...current,
        [key]:
          value,
      }),
    );
  };

  const submit = (
    event:
      FormEvent,
  ) => {
    event.preventDefault();
    setPage(
      0,
    );
    setApplied({
      ...form,
    });
  };

  const clear = () => {
    setForm(
      initialFilters,
    );
    setApplied(
      initialFilters,
    );
    setPage(
      0,
    );
  };

  return (
    <section className="page audit-page">
      <div className="page-heading audit-heading">
        <div>
          <span className="eyebrow">
            AUDITORÍA
          </span>
          <h1>
            Bitácora del sistema
          </h1>
          <p>
            Mutaciones exitosas con snapshot del actor, ruta, categoría y request id.
          </p>
        </div>
        <button
          className="button"
          type="button"
          onClick={
            () =>
              void events
                .refetch()
          }
          disabled={
            events.isFetching
          }
        >
          Actualizar
        </button>
      </div>

      <form
        className="panel audit-filters"
        onSubmit={
          submit
        }
      >
        <label className="audit-search">
          Buscar
          <input
            value={
              form.q
            }
            maxLength={
              120
            }
            placeholder="Actor, correo o ruta"
            onChange={
              (
                event,
              ) =>
                update(
                  "q",
                  event.target
                    .value,
                )
            }
          />
        </label>

        <label>
          Rol
          <select
            value={
              form.role
            }
            onChange={
              (
                event,
              ) =>
                update(
                  "role",
                  event.target
                    .value,
                )
            }
          >
            <option value="">
              Todos
            </option>
            <option value="ADMIN">
              Admin
            </option>
            <option value="STORE_MANAGER">
              Encargado
            </option>
            <option value="CUSTOMER">
              Cliente
            </option>
          </select>
        </label>

        <label>
          Categoría
          <select
            value={
              form.category
            }
            onChange={
              (
                event,
              ) =>
                update(
                  "category",
                  event.target
                    .value,
                )
            }
          >
            <option value="">
              Todas
            </option>
            {Object.entries(
              CATEGORY_LABELS,
            ).map(
              (
                [
                  value,
                  label,
                ],
              ) => (
                <option
                  key={
                    value
                  }
                  value={
                    value
                  }
                >
                  {label}
                </option>
              ),
            )}
          </select>
        </label>

        <label>
          Método
          <select
            value={
              form.method
            }
            onChange={
              (
                event,
              ) =>
                update(
                  "method",
                  event.target
                    .value,
                )
            }
          >
            <option value="">
              Todos
            </option>
            <option value="POST">
              POST
            </option>
            <option value="PUT">
              PUT
            </option>
            <option value="PATCH">
              PATCH
            </option>
            <option value="DELETE">
              DELETE
            </option>
          </select>
        </label>

        <label>
          Resultado
          <select
            value={
              form.success
            }
            onChange={
              (
                event,
              ) =>
                update(
                  "success",
                  event.target
                    .value,
                )
            }
          >
            <option value="">
              Todos
            </option>
            <option value="true">
              Exitoso
            </option>
            <option value="false">
              Fallido
            </option>
          </select>
        </label>

        <label>
          Desde
          <input
            type="date"
            value={
              form.from
            }
            onChange={
              (
                event,
              ) =>
                update(
                  "from",
                  event.target
                    .value,
                )
            }
          />
        </label>

        <label>
          Hasta
          <input
            type="date"
            value={
              form.to
            }
            onChange={
              (
                event,
              ) =>
                update(
                  "to",
                  event.target
                    .value,
                )
            }
          />
        </label>

        <label>
          Filas
          <select
            value={
              form.size
            }
            onChange={
              (
                event,
              ) =>
                update(
                  "size",
                  event.target
                    .value,
                )
            }
          >
            <option value="25">
              25
            </option>
            <option value="50">
              50
            </option>
            <option value="100">
              100
            </option>
          </select>
        </label>

        <div className="audit-actions">
          <button
            className="button primary"
            type="submit"
          >
            Aplicar
          </button>
          <button
            className="button"
            type="button"
            onClick={
              clear
            }
          >
            Limpiar
          </button>
        </div>
      </form>

      {events.error instanceof
      Error ? (
        <Notice kind="error">
          {events.error.message}
        </Notice>
      ) : null}

      <article className="panel">
        <div className="audit-summary">
          <strong>
            {events.data
              ?.totalElements
              .toLocaleString(
                "es-BO",
              ) ??
              "0"}{" "}
            eventos
          </strong>
          <span>
            Página{" "}
            {(events.data?.page ??
              0) +
              1}
            {" "}de{" "}
            {Math.max(
              1,
              events.data
                ?.totalPages ??
                0,
            )}
          </span>
        </div>

        <div className="table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>
                  Fecha
                </th>
                <th>
                  Actor
                </th>
                <th>
                  Rol
                </th>
                <th>
                  Categoría
                </th>
                <th>
                  Acción
                </th>
                <th>
                  Ruta
                </th>
                <th>
                  Estado
                </th>
                <th>
                  Request ID
                </th>
              </tr>
            </thead>
            <tbody>
              {events.isLoading ? (
                <tr>
                  <td colSpan={8}>
                    Cargando auditoría…
                  </td>
                </tr>
              ) : events.data
                  ?.content
                  .length ===
                0 ? (
                <tr>
                  <td colSpan={8}>
                    No hay eventos para los filtros elegidos.
                  </td>
                </tr>
              ) : (
                events.data
                  ?.content
                  .map(
                    (
                      event,
                    ) => (
                      <tr
                        key={
                          event.id
                        }
                      >
                        <td>
                          {new Date(
                            event.occurredAt,
                          ).toLocaleString(
                            "es-BO",
                          )}
                        </td>
                        <td>
                          <strong>
                            {actorLabel(
                              event,
                            )}
                          </strong>
                          <small>
                            {event.actorEmail ??
                              ""}
                          </small>
                        </td>
                        <td>
                          {event.actorRole}
                        </td>
                        <td>
                          {CATEGORY_LABELS[
                            event.category
                          ] ??
                            event.category}
                        </td>
                        <td>
                          {methodLabel(
                            event.httpMethod,
                          )}
                        </td>
                        <td>
                          <code>
                            {event.routePattern}
                          </code>
                        </td>
                        <td>
                          <span
                            className={
                              event.success
                                ? "audit-ok"
                                : "audit-fail"
                            }
                          >
                            {event.statusCode}
                          </span>
                        </td>
                        <td>
                          <code>
                            {event.requestId ??
                              "—"}
                          </code>
                        </td>
                      </tr>
                    ),
                  )
              )}
            </tbody>
          </table>
        </div>

        <div className="audit-pagination">
          <button
            className="button"
            type="button"
            disabled={
              page <=
                0 ||
              events.isFetching
            }
            onClick={
              () =>
                setPage(
                  (
                    current,
                  ) =>
                    Math.max(
                      0,
                      current -
                        1,
                    ),
                )
            }
          >
            Anterior
          </button>
          <button
            className="button"
            type="button"
            disabled={
              !events.data ||
              page +
                1 >=
                events.data
                  .totalPages ||
              events.isFetching
            }
            onClick={
              () =>
                setPage(
                  (
                    current,
                  ) =>
                    current +
                    1,
                )
            }
          >
            Siguiente
          </button>
        </div>
      </article>
    </section>
  );
}
