"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { mockClients, mockCAs } from "@/lib/mockData";
import {
  IconClients,
  IconMailboxes,
  IconCheck,
  IconMail,
  IconApplications,
  IconWarning,
  IconSearch,
} from "@/components/icons";

export default function ClientsPage() {
  const router = useRouter();

  // ── States ──────────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");

  // ── Computed Top Summary Metrics ──────────────────────────────────────────
  const allClientsCount = mockClients.length;
  const connectedMailboxesCount = mockClients.filter(
    (c) => c.mailboxStatus === "Active" || c.mailboxStatus === "Needs Connection"
  ).length;
  const activeMailboxesCount = mockClients.filter(
    (c) => c.mailboxStatus === "Active"
  ).length;
  const totalEmailsToday = mockClients.reduce((sum, c) => sum + c.emailsToday, 0);
  const totalPendingClassification = mockClients.reduce(
    (sum, c) => sum + c.pendingClassification, 0
  );
  const totalReviewRequired = mockClients.reduce(
    (sum, c) => sum + c.reviewRequired, 0
  );

  // ── Filter Clients ──────────────────────────────────────────────────────────
  const filteredClients = useMemo(() => {
    return mockClients.filter((client) => {
      return (
        searchTerm === "" ||
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.mailbox.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.caName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [searchTerm]);

  return (
    <div className="clients-page-container">
      {/* Header bar */}
      <header className="page-header">
        <div>
          <h1 className="page-title">Clients & Mailboxes</h1>
          <p className="page-subtitle">
            Configure applicant client profiles, connect mailboxes, and track advisor assignments.
          </p>
        </div>
        {/* Add Client Mailbox connection is hidden in current phase */}
      </header>

      {/* ── Summary Metrics Row ── */}
      <section className="metrics-grid">
        <div className="metric-card">
          <div className="metric-meta">
            <span className="metric-icon">
              <IconClients size={16} />
            </span>
            <span className="metric-title">All Clients</span>
          </div>
          <div className="metric-value">{allClientsCount}</div>
          <div className="metric-trend text-muted">Registered profiles</div>
        </div>

        <div className="metric-card">
          <div className="metric-meta">
            <span className="metric-icon">
              <IconMailboxes size={16} />
            </span>
            <span className="metric-title">Connected</span>
          </div>
          <div className="metric-value">{connectedMailboxesCount}</div>
          <div className="metric-trend text-muted">Zoho integrations</div>
        </div>

        <div className="metric-card">
          <div className="metric-meta">
            <span className="metric-icon">
              <IconCheck size={16} />
            </span>
            <span className="metric-title">Active</span>
          </div>
          <div className="metric-value">{activeMailboxesCount}</div>
          <div className="metric-trend text-success">Healthy feeds</div>
        </div>

        <div className="metric-card">
          <div className="metric-meta">
            <span className="metric-icon">
              <IconMail size={16} />
            </span>
            <span className="metric-title">Emails Today</span>
          </div>
          <div className="metric-value">{totalEmailsToday}</div>
          <div className="metric-trend text-muted">Processed headers</div>
        </div>

        <div className="metric-card">
          <div className="metric-meta">
            <span className="metric-icon">
              <IconApplications size={16} />
            </span>
            <span className="metric-title">Pending Class.</span>
          </div>
          <div className="metric-value">{totalPendingClassification}</div>
          <div className="metric-trend text-pending">AI queue</div>
        </div>

        <div className="metric-card highlight-urgent">
          <div className="metric-meta">
            <span className="metric-icon">
              <IconWarning size={16} />
            </span>
            <span className="metric-title">Review Required</span>
          </div>
          <div className="metric-value text-urgent">{totalReviewRequired}</div>
          <div className="metric-trend text-urgent font-bold">Needs CA action</div>
        </div>
      </section>

      {/* Search control */}
      <section className="search-card">
        <span className="search-icon">
          <IconSearch size={18} />
        </span>
        <input
          type="text"
          placeholder="Search by client name, email, Zoho mailbox, assigned CA..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </section>

      {/* Clients Data Results */}
      <section className="clients-list-container">
        {filteredClients.length === 0 ? (
          <div className="empty-results-box">
            <div className="empty-icon">
              <IconClients size={48} style={{ margin: "0 auto 12px" }} />
            </div>
            <h3>No Clients Found</h3>
            <p>No client records match your current search queries.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table view */}
            <div className="table-card">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Client Name / Email</th>
                    <th>Zoho Mailbox</th>
                    <th>Mailbox Status</th>
                    <th>Assigned CA</th>
                    <th>Emails Today</th>
                    <th>Pending Class.</th>
                    <th>Review Req.</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => (
                    <tr key={client.id} className="table-row-hover">
                      <td>
                        <div className="client-name font-semibold">{client.name}</div>
                        <div className="client-email">{client.email}</div>
                      </td>
                      <td className="font-semibold">{client.mailbox}</td>
                      <td>
                        <span
                          className={`status-pill ${
                            client.mailboxStatus === "Active"
                              ? "healthy"
                              : "needs_reconnect"
                          }`}
                        >
                          {client.mailboxStatus}
                        </span>
                      </td>
                      <td>{client.caName}</td>
                      <td className="font-tabular">{client.emailsToday}</td>
                      <td className="font-tabular">{client.pendingClassification}</td>
                      <td className="font-tabular font-bold text-urgent">
                        {client.reviewRequired}
                      </td>
                      <td>
                        <button
                          className="action-btn"
                          onClick={() => router.push(`/clients/${client.id}`)}
                        >
                          Open Dashboard
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards view */}
            <div className="mobile-cards-list">
              {filteredClients.map((client) => (
                <div key={client.id} className="mobile-client-card">
                  <div className="card-top-row">
                    <div>
                      <div className="m-client-name">{client.name}</div>
                      <div className="m-client-email">{client.email}</div>
                    </div>
                    <span
                      className={`status-pill ${
                        client.mailboxStatus === "Active"
                          ? "healthy"
                          : "needs_reconnect"
                      }`}
                    >
                      {client.mailboxStatus}
                    </span>
                  </div>

                  <div className="card-mid-details">
                    <div className="m-detail-row">
                      <span>Mailbox:</span>
                      <strong>{client.mailbox}</strong>
                    </div>
                    <div className="m-detail-row">
                      <span>Advisor:</span>
                      <strong>{client.caName}</strong>
                    </div>
                  </div>

                  <div className="card-bottom-counts">
                    <div className="count-badge">
                      <span>Today:</span> <strong>{client.emailsToday}</strong>
                    </div>
                    <div className="count-badge">
                      <span>Pending:</span> <strong>{client.pendingClassification}</strong>
                    </div>
                    <div className="count-badge urgent-badge">
                      <span>Review:</span> <strong>{client.reviewRequired}</strong>
                    </div>
                  </div>

                  <div className="card-actions-panel">
                    <button
                      className="btn btn-secondary btn-full"
                      onClick={() => router.push(`/clients/${client.id}`)}
                    >
                      Open Client Dashboard
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <style jsx>{`
        .clients-page-container {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }

        .page-title {
          font-family: var(--font-brand);
          font-size: 1.85rem;
          font-weight: 700;
          color: var(--text-dark);
          letter-spacing: -0.5px;
        }

        .page-subtitle {
          color: var(--text-muted);
          font-size: 0.95rem;
          margin-top: 4px;
        }

        /* ── Summary Cards Grid ── */
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 16px;
        }

        .metric-card {
          background-color: var(--white);
          border: 1px solid var(--border-gray);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          box-shadow: var(--card-shadow);
        }

        .metric-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-muted);
          font-size: 0.8125rem;
          font-weight: 600;
        }

        .metric-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
        }

        .metric-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-dark);
        }

        .metric-trend {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .text-success {
          color: var(--success-green-text) !important;
        }

        .text-pending {
          color: var(--pending-orange) !important;
        }

        .text-urgent {
          color: var(--urgent-red) !important;
        }

        .highlight-urgent {
          border-color: var(--urgent-red);
          background-color: var(--urgent-red-bg);
        }

        /* ── Search Bar ── */
        .search-card {
          background-color: var(--white);
          border: 1px solid var(--border-gray);
          border-radius: 12px;
          padding: 16px 24px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: var(--card-shadow);
        }

        .search-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--text-light);
        }

        .search-card input {
          border: none;
          background: none;
          outline: none;
          width: 100%;
          color: var(--text-dark);
          font-size: 0.925rem;
          font-family: var(--font-display);
        }

        /* ── Results List ── */
        .clients-list-container {
          width: 100%;
        }

        .table-card {
          background-color: var(--white);
          border: 1px solid var(--border-gray);
          border-radius: 12px;
          box-shadow: var(--card-shadow);
          overflow: hidden;
        }

        .ops-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.875rem;
        }

        .ops-table th {
          padding: 14px 20px;
          color: var(--text-muted);
          font-weight: 600;
          border-bottom: 1px solid var(--border-gray);
          background-color: rgba(248, 250, 252, 0.5);
        }

        .ops-table td {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-gray);
          vertical-align: middle;
        }

        .table-row-hover:hover {
          background-color: var(--workspace-bg);
        }

        .client-email {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .font-semibold {
          font-weight: 600;
        }

        .font-bold {
          font-weight: 700;
        }

        .font-tabular {
          font-feature-settings: "tnum";
        }

        /* Badges & Pills */
        .status-pill {
          display: inline-flex;
          padding: 2px 8px;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .status-pill.healthy {
          background-color: var(--success-green-bg);
          color: var(--success-green-text);
        }

        .status-pill.needs_reconnect {
          background-color: var(--pending-orange-bg);
          color: var(--pending-orange);
        }

        .action-btn {
          background: none;
          border: none;
          color: var(--primary-blue);
          font-weight: 600;
          cursor: pointer;
          font-size: 0.875rem;
        }

        .action-btn:hover {
          text-decoration: underline;
        }

        /* Reusable button styling */
        .btn {
          padding: 10px 20px;
          font-size: 0.875rem;
          font-weight: 600;
          border-radius: 9999px;
          border: none;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .btn-secondary {
          background-color: var(--white);
          border: 1px solid var(--border-gray);
          color: var(--text-dark);
        }

        .btn-secondary:hover {
          background-color: var(--workspace-bg);
        }

        .btn-full {
          width: 100%;
          display: flex;
          justify-content: center;
        }

        /* Reusable empty results */
        .empty-results-box {
          background-color: var(--white);
          border: 1px solid var(--border-gray);
          border-radius: 12px;
          padding: 48px;
          text-align: center;
          box-shadow: var(--card-shadow);
        }

        .empty-icon {
          display: flex;
          justify-content: center;
          margin-bottom: 12px;
          color: var(--text-light);
        }

        .empty-results-box h3 {
          font-size: 1.25rem;
          font-weight: 700;
        }

        .empty-results-box p {
          color: var(--text-muted);
          font-size: 0.925rem;
          margin-top: 8px;
        }

        .mobile-cards-list {
          display: none;
        }

        /* ── Responsive Rules ── */
        @media (max-width: 1200px) {
          .metrics-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
          }
        }

        @media (max-width: 1023px) {
          .ops-table th:nth-child(5),
          .ops-table td:nth-child(5),
          .ops-table th:nth-child(6),
          .ops-table td:nth-child(6) {
            display: none; /* Hide secondary counts on tablet */
          }
        }

        @media (max-width: 767px) {
          .page-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .metrics-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }

          .metric-value {
            font-size: 1.25rem;
          }

          .table-card {
            display: none;
          }

          .mobile-cards-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .mobile-client-card {
            background-color: var(--white);
            border: 1px solid var(--border-gray);
            border-radius: 12px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            box-shadow: var(--card-shadow);
          }

          .card-top-row {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
          }

          .card-top-row > div:first-child {
            min-width: 0;
            flex: 1;
          }

          .m-client-name {
            font-weight: 700;
            font-size: 0.875rem;
          }

          .m-client-email {
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-top: 2px;
            word-break: break-all;
            overflow-wrap: break-word;
          }

          .card-mid-details {
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-size: 0.8125rem;
          }

          .m-detail-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
          }

          .m-detail-row span {
            color: var(--text-muted);
            flex-shrink: 0;
          }

          .m-detail-row strong {
            word-break: break-all;
            overflow-wrap: break-word;
            text-align: right;
          }

          .card-bottom-counts {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            border-top: 1px dashed var(--border-gray);
            padding-top: 10px;
          }

          .count-badge {
            font-size: 0.75rem;
            color: var(--text-muted);
            background-color: var(--workspace-bg);
            padding: 4px 8px;
            border-radius: 6px;
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .count-badge.urgent-badge {
            background-color: var(--urgent-red-bg);
            color: var(--urgent-red);
          }

          .card-actions-panel {
            margin-top: 4px;
          }
        }
      `}</style>
    </div>
  );
}
