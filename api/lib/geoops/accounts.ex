defmodule Geoops.Accounts do
  @moduledoc """
  The Accounts context — user management and authentication.
  """

  import Ecto.Query, warn: false
  alias Geoops.Repo
  alias Geoops.Accounts.User

  @doc "Get a user by ID. Returns nil if not found."
  def get_user(id) do
    Repo.get(User, id)
  end

  @doc "Get a user by username. Returns nil if not found."
  def get_user_by_username(username) do
    Repo.get_by(User, username: username)
  end

  @doc "Authenticate a user by username and password. Returns {:ok, user} or {:error, reason}."
  def authenticate(username, password) do
    user = get_user_by_username(username)

    cond do
      is_nil(user) ->
        Pbkdf2.no_user_verify()
        {:error, :invalid_credentials}

      Pbkdf2.verify_pass(password, user.password_hash) ->
        {:ok, user}

      true ->
        {:error, :invalid_credentials}
    end
  end

  @doc "Create a new admin user."
  def create_user(attrs \\ %{}) do
    %User{}
    |> User.changeset(attrs)
    |> Repo.insert()
  end
end
