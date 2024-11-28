-- This migration makes sure that the first argument of `get_department_availability()` is `p_department`.
-- This migrates the function defined in `020-utiliz-factors.sql` if it was created before this migration was created.

drop function if exists get_department_availability(bigint, bigint);

create or replace function get_department_availability(
  in p_department text, -- the department name, eg `Corrugated` or `Kitting`
  in p_start bigint, -- start time in milliseconds since 1970-01-01
  in p_stop bigint -- stop time in milliseconds since 1970-01-01
)
returns table ("time" timestamptz, "availability" float)
language plpgsql
as
$body$
begin
  return query
    select time_bin as time, avg(foo.availability * get_utilization_factor(device)) as availability from (
      select
        nodes.props->>'name' as device, -- eg 'Marumatsu'
        date_trunc('day', bins.time) as time_bin, -- binsize=day
        sum(coalesce(active::float, 0)) / sum(nullif(available::float, 0.0)) as availability
      from bins
        join nodes on nodes.node_id = bins.device_id
      where
        resolution = '00:01:00'::interval -- resolution=1min
        and bins.time >= ms2timestamptz(p_start)
        and bins.time < ms2timestamptz(p_stop)
        and nodes.props->>'department' = p_department
      group by device, time_bin
      order by device, time_bin
    ) as foo
  group by time_bin;
end;
$body$;