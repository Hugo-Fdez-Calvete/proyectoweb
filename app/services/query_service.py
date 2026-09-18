from app.repositories.query_repo import UserRepository


user_repo = UserRepository()


def get_user_by_username(username: str, repo: UserRepository = None):
    repository = repo or user_repo

    return repository.find_by_username(username)


def get_user_by_email(email: str, repo: UserRepository = None):
    repository = repo or user_repo

    return repository.find_by_email(email)


def get_user_by_phone(phone: str, repo: UserRepository = None):
    repository = repo or user_repo

    return repository.find_by_phone(phone)


def create_user(username: str,email: str,phone: str,password_hash: str,repo: UserRepository = None):
    repository = repo or user_repo

    return repository.create(username, email, phone, password_hash)


def update_last_login(user_id, repo: UserRepository = None):
    repository = repo or user_repo

    user = repository.find_by_id(user_id)
    if user:
        return repository.update_last_login(user)
    return None