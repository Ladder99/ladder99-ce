-- This migration makes sure that the `devices` view also contains the `department` column.
-- This migrates the view defined in `003-base-views.sql` if it was created before this migration was created.

CREATE OR REPLACE VIEW devices AS
SELECT
  nodes.node_id,
  -- needed name to make a unique string when viewing multiple agents
  -- on the same device with the mazak endpoints.
  -- concat(nodes.props->>'name', ' (', nodes.props->>'uuid', ')') as name_uuid,
  nodes.props->>'name' as name,
  nodes.props->>'uuid' as uuid,
  nodes.props->>'path' as path,
  nodes.props->>'order' as "order",
  nodes.props->>'department' as department
FROM
  nodes
WHERE
  nodes.props->>'node_type' = 'Device';