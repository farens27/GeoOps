defmodule GeoopsWeb.Auth.Guardian do
  use Guardian, otp_app: :geoops

  alias Geoops.Accounts

  @impl true
  def subject_for_token(%{id: id}, _claims) do
    {:ok, to_string(id)}
  end

  def subject_for_token(_, _) do
    {:error, :invalid_resource}
  end

  @impl true
  def resource_from_claims(%{"sub" => id}) do
    case Accounts.get_user(id) do
      nil -> {:error, :not_found}
      user -> {:ok, user}
    end
  end

  def resource_from_claims(_) do
    {:error, :invalid_claims}
  end
end
