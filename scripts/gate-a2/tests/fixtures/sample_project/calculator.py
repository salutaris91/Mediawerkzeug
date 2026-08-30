def add(a: int, b: int) -> int:
    return a + b


def subtract(a: int, b: int) -> int:
    # BUG: returning addition instead of subtraction
    return a + b
