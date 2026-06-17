defmodule Geoops.Geofences do
  @moduledoc "Geofences context — CRUD and spatial operations."

  import Ecto.Query, warn: false
  alias Geoops.Repo
  alias Geoops.Geofences.Geofence

  def list_geofences do
    Repo.all(from g in Geofence, order_by: [asc: g.name])
  end

  def list_active_geofences do
    Repo.all(from g in Geofence, where: g.is_active == true, order_by: [asc: g.name])
  end

  def get_geofence(id) do
    Repo.get(Geofence, id)
  end

  def get_geofence!(id) do
    Repo.get!(Geofence, id)
  end

  def create_geofence(attrs \\ %{}) do
    %Geofence{}
    |> Geofence.changeset(attrs)
    |> Repo.insert()
  end

  def update_geofence(%Geofence{} = geofence, attrs) do
    geofence
    |> Geofence.changeset(attrs)
    |> Repo.update()
  end

  def delete_geofence(%Geofence{} = geofence) do
    Repo.delete(geofence)
  end

  @doc """
  Get all active geofences as plain maps for the in-memory cache.
  Returns list of maps with :id, :name, :zone_type, :color, :polygon_coords
  where polygon_coords is a list of {lng, lat} tuples for ray-casting.
  """
  def get_geofences_for_cache do
    list_active_geofences()
    |> Enum.map(fn g ->
      %{
        id: g.id,
        name: g.name,
        zone_type: g.zone_type,
        color: g.color,
        # polygon stored as [[lng, lat], ...] in DB
        polygon_coords: g.polygon_coords || []
      }
    end)
  end
end
