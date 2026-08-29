INSERT INTO service_type (id, name, description, duration_minutes, pre_buffer_minutes, post_buffer_minutes, booking_mode, deposit_tier, deposit_cents) VALUES
  ('consultation', 'Tattoo-Beratung', 'Idee, Körperstelle, Stil, Machbarkeit und Preisrahmen klären.', 30, 0, 0, 'request', 'NONE', 0),
  ('small-tattoo', 'Kleines Tattoo', 'Abgestimmte, kleinere Motive mit bis zu zwei Stunden Studiozeit.', 120, 15, 15, 'request', 'D50', 5000),
  ('day-session', 'Tagessitzung', 'Längerer Termin für größere oder aufwendige Tattoo-Projekte.', 360, 30, 30, 'request', 'D150', 15000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO artist (id, display_name, bio) VALUES
  ('mara', 'Mara', 'Fineline und floral.'),
  ('jon', 'Jon', 'Blackwork und Lettering.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO resource (id, name, kind) VALUES
  ('station-1', 'Arbeitsplatz 1', 'station'),
  ('station-2', 'Arbeitsplatz 2', 'station'),
  ('consult-1', 'Beratungsecke', 'consult')
ON CONFLICT (id) DO NOTHING;

INSERT INTO artist_service (artist_id, service_type_id)
SELECT a.id, s.id FROM artist a CROSS JOIN service_type s
ON CONFLICT DO NOTHING;

INSERT INTO availability_rule (artist_id, weekday, start_local, end_local, valid_from)
SELECT a.id, d.wd, TIME '10:00', TIME '18:00', CURRENT_DATE
FROM artist a CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS d(wd)
ON CONFLICT DO NOTHING;

INSERT INTO blocked_period (artist_id, resource_id, starts_at, ends_at, reason)
SELECT 'jon', NULL, (CURRENT_DATE + INTERVAL '14 days'), (CURRENT_DATE + INTERVAL '21 days'), 'Urlaub'
WHERE NOT EXISTS (SELECT 1 FROM blocked_period WHERE artist_id = 'jon' AND reason = 'Urlaub');
