defmodule Geoops.Tracking.WorkerState do
  @moduledoc """
  In-memory ETS store for live worker positions and geofence zone membership.

  All reads/writes are purely in-memory — zero DB cost on the hot path.
  Dirty positions are batch-synced to CockroachDB every 60 seconds by
  `Geoops.Tracking.PositionSyncer`.

  ## ETS tables

  | Table               | Key         | Value                             |
  |---------------------|-------------|-----------------------------------|
  | `:worker_positions` | `worker_id` | `{worker_id, lat, lng, ts_ms}`   |
  | `:worker_zones`     | `worker_id` | `{worker_id, MapSet.t(zone_id)}` |

  Both tables are created with `write_concurrency: true` + `read_concurrency: true`
  so parallel GPS reports for different workers never block each other.

  ## Startup

  `init/0` is called once at application boot (via a supervised Task).  It is
  idempotent — safe to call multiple times even if the tables already exist.
  """

  @positions_table :worker_positions
  @zones_table :worker_zones

  # ---------------------------------------------------------------------------
  # Init (called once from the application supervisor)
  # ---------------------------------------------------------------------------

  @doc "Create the ETS tables if they do not already exist.  Returns :ok."
  def init do
    if :ets.info(@positions_table) == :undefined do
      :ets.new(@positions_table, [
        :named_table,
        :public,
        :set,
        write_concurrency: true,
        read_concurrency: true
      ])
    end

    if :ets.info(@zones_table) == :undefined do
      :ets.new(@zones_table, [
        :named_table,
        :public,
        :set,
        write_concurrency: true,
        read_concurrency: true
      ])
    end

    :ok
  end

  # ---------------------------------------------------------------------------
  # Position operations
  # ---------------------------------------------------------------------------

  @doc """
  Insert or overwrite the position for `worker_id`.

  Timestamps are stored as milliseconds since the Unix epoch so that
  `get_dirty_positions/1` can efficiently filter by time.
  """
  def update_position(worker_id, lat, lng) do
    :ets.insert(@positions_table, {worker_id, lat, lng, :os.system_time(:millisecond)})
  end

  @doc """
  Fetch the most recent cached position for a worker.

  Returns `{:ok, lat, lng, ts_ms}` or `:not_found`.
  """
  def get_position(worker_id) do
    case :ets.lookup(@positions_table, worker_id) do
      [{^worker_id, lat, lng, ts}] -> {:ok, lat, lng, ts}
      [] -> :not_found
    end
  end

  @doc "Return all live worker positions as a list of maps."
  def get_all_positions do
    :ets.tab2list(@positions_table)
    |> Enum.map(fn {worker_id, lat, lng, ts} ->
      %{worker_id: worker_id, lat: lat, lng: lng, ts: ts}
    end)
  end

  @doc """
  Return positions that were updated at or after `since_ts` (milliseconds).

  Used by `PositionSyncer` to find rows that need to be written to DB.
  """
  def get_dirty_positions(since_ts) do
    :ets.tab2list(@positions_table)
    |> Enum.filter(fn {_id, _lat, _lng, ts} -> ts >= since_ts end)
    |> Enum.map(fn {worker_id, lat, lng, _ts} -> {worker_id, lat, lng} end)
  end

  # ---------------------------------------------------------------------------
  # Zone-membership operations
  # ---------------------------------------------------------------------------

  @doc """
  Return the set of geofence IDs the worker is currently inside.

  Returns a `MapSet` (empty if the worker has no recorded zone membership).
  """
  def get_worker_zones(worker_id) do
    case :ets.lookup(@zones_table, worker_id) do
      [{^worker_id, zone_ids}] -> zone_ids
      [] -> MapSet.new()
    end
  end

  @doc "Overwrite the zone-membership `MapSet` for `worker_id`."
  def update_worker_zones(worker_id, zone_ids) when is_struct(zone_ids, MapSet) do
    :ets.insert(@zones_table, {worker_id, zone_ids})
  end
end
