CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    total_urls INTEGER NOT NULL DEFAULT 0,
    completed_urls INTEGER NOT NULL DEFAULT 0,
    failed_urls INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS urls (
    id UUID PRIMARY KEY,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    http_status INTEGER,
    response_time_ms INTEGER,
    page_title TEXT,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_urls_batch_id
    ON urls(batch_id);

CREATE INDEX IF NOT EXISTS idx_urls_status
    ON urls(status);