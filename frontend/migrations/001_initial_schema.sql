-- LabLineage Guardian Initial Schema
-- Target: PostgreSQL 14+

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    classification TEXT NOT NULL DEFAULT 'internal',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id),
    source_type TEXT NOT NULL,
    display_name TEXT NOT NULL,
    connectivity_mode TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES sources(id),
    snapshot_type TEXT NOT NULL,
    root_hash TEXT,
    collected_at TIMESTAMPTZ NOT NULL,
    signature_status TEXT NOT NULL
);

CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id),
    asset_type TEXT NOT NULL,
    logical_name TEXT,
    content_hash TEXT,
    status TEXT NOT NULL DEFAULT 'candidate',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lineage_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id),
    from_entity_type TEXT NOT NULL,
    from_entity_id UUID NOT NULL,
    relation TEXT NOT NULL,
    to_entity_type TEXT NOT NULL,
    to_entity_id UUID NOT NULL,
    confidence NUMERIC(5,4) NOT NULL,
    confidence_label TEXT NOT NULL,
    evidence_type TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE findings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id),
    finding_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    affected_entities JSONB NOT NULL,
    evidence_ids UUID[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'open',
    proposed_action TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trace_id TEXT NOT NULL,
    user_subject TEXT NOT NULL,
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    status TEXT NOT NULL,
    details TEXT
);

-- Indexes
CREATE INDEX idx_assets_project_type ON assets(project_id, asset_type);
CREATE INDEX idx_edges_from ON lineage_edges(from_entity_type, from_entity_id);
CREATE INDEX idx_edges_to ON lineage_edges(to_entity_type, to_entity_id);
CREATE INDEX idx_findings_project_status ON findings(project_id, status);
