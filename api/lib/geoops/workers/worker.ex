defmodule Geoops.Workers.Worker do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, Ecto.ULID, autogenerate: true}
  @derive {Jason.Encoder,
           only: [:id, :name, :role, :team, :phone, :status, :latitude, :longitude, :last_seen, :created_at, :updated_at]}

  schema "workers" do
    field :name, :string
    field :role, :string
    field :team, :string
    field :phone, :string
    field :status, :string, default: "ACTIVE"
    field :latitude, :float
    field :longitude, :float
    field :last_seen, :utc_datetime

    timestamps(inserted_at: :created_at, updated_at: :updated_at)
  end

  def changeset(worker, attrs) do
    worker
    |> cast(attrs, [:name, :role, :team, :phone, :status])
    |> validate_required([:name, :role, :team])
    |> validate_length(:name, min: 1, max: 100)
    |> validate_inclusion(:status, ["ACTIVE", "INACTIVE"])
  end
end
