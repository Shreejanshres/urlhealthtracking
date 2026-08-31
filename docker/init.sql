--
-- PostgreSQL database dump
--

\restrict ElAMziYV7Keqymha0FK5bGyoAyiE2ba1dk6SQZ9UNEtQljhlW8Ai9wpuU0WpchY

-- Dumped from database version 17.11 (Debian 17.11-1.pgdg13+2)
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: batches; Type: TABLE; Schema: public; Owner: urltracking
--

CREATE TABLE public.batches (
    id uuid NOT NULL,
    status character varying(20) DEFAULT 'queued'::character varying NOT NULL,
    total_urls integer DEFAULT 0 NOT NULL,
    completed_urls integer DEFAULT 0 NOT NULL,
    failed_urls integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.batches OWNER TO urltracking;

--
-- Name: urls; Type: TABLE; Schema: public; Owner: urltracking
--

CREATE TABLE public.urls (
    id uuid NOT NULL,
    batch_id uuid NOT NULL,
    url text NOT NULL,
    status character varying(20) DEFAULT 'queued'::character varying NOT NULL,
    http_status integer,
    response_time_ms integer,
    page_title text,
    error text,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


ALTER TABLE public.urls OWNER TO urltracking;

--
-- Name: batches batches_pkey; Type: CONSTRAINT; Schema: public; Owner: urltracking
--

ALTER TABLE ONLY public.batches
    ADD CONSTRAINT batches_pkey PRIMARY KEY (id);


--
-- Name: urls urls_pkey; Type: CONSTRAINT; Schema: public; Owner: urltracking
--

ALTER TABLE ONLY public.urls
    ADD CONSTRAINT urls_pkey PRIMARY KEY (id);


--
-- Name: idx_urls_batch_id; Type: INDEX; Schema: public; Owner: urltracking
--

CREATE INDEX idx_urls_batch_id ON public.urls USING btree (batch_id);


--
-- Name: idx_urls_status; Type: INDEX; Schema: public; Owner: urltracking
--

CREATE INDEX idx_urls_status ON public.urls USING btree (status);


--
-- Name: urls urls_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: urltracking
--

ALTER TABLE ONLY public.urls
    ADD CONSTRAINT urls_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict ElAMziYV7Keqymha0FK5bGyoAyiE2ba1dk6SQZ9UNEtQljhlW8Ai9wpuU0WpchY

