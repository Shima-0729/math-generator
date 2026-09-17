import math
import random
import csv

from math import gcd, isqrt
from pathlib import Path

# csv出力用関数
def export_questions_to_csv(data, filename):
    """
    data:
    [
        ['21 ÷ 7 = □', '3'],
        ['6 × 3 = □', '18'],
        ...
    ]
    """

    with open(filename, mode="w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)

        # ヘッダー
        writer.writerow(["index", "problem", "ans"])

        # データ書き込み
        for i, (problem, ans) in enumerate(data):
            writer.writerow([i+1, problem, ans])

    print(f"{filename} に保存しました")

# 有理数上で計算を行うためのクラス
class Rational:
    def __init__(self, numerator=0, denominator=1):
        if not isinstance(numerator, int):
            raise TypeError("numerator must be int")

        if not isinstance(denominator, int):
            raise TypeError("denominator must be int")

        if denominator == 0:
            raise ZeroDivisionError("denominator cannot be zero")

        # 分母を必ず正にする
        if denominator < 0:
            numerator = -numerator
            denominator = -denominator

        # 約分
        g = gcd(abs(numerator), denominator)

        self.numerator = numerator // g
        self.denominator = denominator // g

    # -------------------------
    # 表示
    # -------------------------
    def __str__(self):
        if self.denominator == 1:
            return str(self.numerator)

        return f"{self.numerator}/{self.denominator}"

    def __repr__(self):
        return f"Rational({self.numerator}, {self.denominator})"

    # -------------------------
    # 型変換
    # -------------------------
    def __float__(self):
        return self.numerator / self.denominator

    def __int__(self):
        return self.numerator // self.denominator

    # -------------------------
    # 内部処理
    # -------------------------
    @staticmethod
    def _convert(value):
        """int を Rational に変換する"""
        if isinstance(value, Rational):
            return value

        if isinstance(value, int):
            return Rational(value)

        return NotImplemented

    # -------------------------
    # 加算
    # -------------------------
    def __add__(self, other):
        other = self._convert(other)

        if other is NotImplemented:
            return NotImplemented

        numerator = (
            self.numerator * other.denominator
            + other.numerator * self.denominator
        )

        denominator = self.denominator * other.denominator

        return Rational(numerator, denominator)

    def __radd__(self, other):
        return self + other

    # -------------------------
    # 減算
    # -------------------------
    def __sub__(self, other):
        other = self._convert(other)

        if other is NotImplemented:
            return NotImplemented

        numerator = (
            self.numerator * other.denominator
            - other.numerator * self.denominator
        )

        denominator = self.denominator * other.denominator

        return Rational(numerator, denominator)

    def __rsub__(self, other):
        other = self._convert(other)

        if other is NotImplemented:
            return NotImplemented

        return other - self

    # -------------------------
    # 乗算
    # -------------------------
    def __mul__(self, other):
        other = self._convert(other)

        if other is NotImplemented:
            return NotImplemented

        numerator = self.numerator * other.numerator
        denominator = self.denominator * other.denominator

        return Rational(numerator, denominator)

    def __rmul__(self, other):
        return self * other

    # -------------------------
    # 除算
    # -------------------------
    def __truediv__(self, other):
        other = self._convert(other)

        if other is NotImplemented:
            return NotImplemented

        if other.numerator == 0:
            raise ZeroDivisionError("division by zero")

        numerator = self.numerator * other.denominator
        denominator = self.denominator * other.numerator

        return Rational(numerator, denominator)

    def __rtruediv__(self, other):
        other = self._convert(other)

        if other is NotImplemented:
            return NotImplemented

        return other / self

    # -------------------------
    # 符号
    # -------------------------
    def __neg__(self):
        return Rational(-self.numerator, self.denominator)

    def __pos__(self):
        return self

    def __abs__(self):
        return Rational(abs(self.numerator), self.denominator)

    # -------------------------
    # 比較
    # -------------------------
    def __eq__(self, other):
        other = self._convert(other)

        if other is NotImplemented:
            return False

        return (
            self.numerator == other.numerator
            and self.denominator == other.denominator
        )

    def __lt__(self, other):
        other = self._convert(other)

        if other is NotImplemented:
            return NotImplemented

        return (
            self.numerator * other.denominator
            < other.numerator * self.denominator
        )

    def __le__(self, other):
        return self == other or self < other

    def __gt__(self, other):
        other = self._convert(other)

        if other is NotImplemented:
            return NotImplemented

        return other < self

    def __ge__(self, other):
        return self == other or self > other

    def to_mixed_string(self):
        """有理数をLaTeX形式の帯分数文字列に変換する"""

        sign = "-" if self.numerator < 0 else ""

        numerator = abs(self.numerator)
        denominator = self.denominator

        integer_part = numerator // denominator
        remainder = numerator % denominator

        # 整数の場合
        if remainder == 0:
            return f"{sign}{integer_part}"

        # 1未満の分数の場合
        if integer_part == 0:
            return f"{sign}\\frac{{{remainder}}}{{{denominator}}}"

        # 帯分数の場合
        return f"{sign}{integer_part}\\frac{{{remainder}}}{{{denominator}}}"

# 最小公倍数を求める
def lcm(a, b):
    return abs(a * b) // gcd(a, b)

# 約数を全て求める。整数の場合と異なる。
def divisors_all(n):

    result = set()

    for i in range(1, isqrt(n) + 1):

        if n % i == 0:
            result.add(i)
            result.add(n // i)

    return sorted(result)


from dataclasses import dataclass

# 問題作成に必要な関数
def denominator_lcm(max_den):
    """1 ～ max_den の最小公倍数を返す。"""
    value = 1
    for n in range(2, max_den + 1):
        value = lcm(value, n)
    return value


def cancel_compatible_values(cancel_value, max_den, min_value=1):
    """
    cancel_value と約分した後に残る部分が、
    LCM(1, ..., max_den) の約数になる正整数を列挙する。
    """
    L = denominator_lcm(max_den)
    cancel_divs = divisors_all(abs(cancel_value))
    allowed_divs = divisors_all(L)
    values = set()

    for g in cancel_divs:
        for r in allowed_divs:
            value = g * r
            if value < min_value:
                continue
            remain = value // gcd(value, abs(cancel_value))
            if L % remain == 0:
                values.add(value)

    return sorted(values)



def denominator_allowed(value, max_den):
    """既約分母が LCM(1, ..., max_den) の約数か確認する。"""
    return denominator_lcm(max_den) % value.denominator == 0


def as_rational(value):
    converted = Rational._convert(value)
    if converted is NotImplemented:
        raise TypeError("value must be int or Rational")
    return converted


def within_max_num(value, max_num):
    """演算結果が 0 < value <= max_num か厳密に確認する。"""
    max_value = as_rational(max_num)
    if value.numerator <= 0:
        return False
    return (
        value.numerator * max_value.denominator
        <= max_value.numerator * value.denominator
    )


def valid_result(value, max_num, max_den):
    """値の範囲と、計算結果の分母体系をまとめて確認する。"""
    return (
        within_max_num(value, max_num)
        and denominator_allowed(value, max_den)
    )


def floor_rational_times(value, factor):
    """floor(value * factor) を浮動小数点数を使わず求める。"""
    value = as_rational(value)
    return value.numerator * factor // value.denominator


def bounded_integer_candidates(first, last, limit):
    """巨大な整数範囲から、端点を含む有限個の候補を選ぶ。"""
    if last < first:
        return []

    count = last - first + 1
    if count <= limit:
        values = list(range(first, last + 1))
        random.shuffle(values)
        return values

    values = {first, last, (first + last) // 2}
    target = min(limit, count)
    while len(values) < target:
        values.add(random.randint(first, last))

    values = list(values)
    random.shuffle(values)
    return values


def small_component_values(values, max_component=120):
    """分子・分母の探索に使う、小さい整数だけを昇順で返す。"""
    return [
        value for value in sorted(set(values))
        if value <= max_component
    ]


def smallest_op_candidates(candidates, limit=20):
    """表示される分子・分母が小さい候補から最大 limit 個を返す。"""
    return sorted(
        candidates,
        key=lambda candidate: (
            max(
                abs(candidate.operand.numerator),
                candidate.operand.denominator,
            ),
            abs(candidate.operand.numerator)
            + candidate.operand.denominator,
            candidate.operand.denominator,
            abs(candidate.operand.numerator),
        ),
    )[:limit]


DECIMAL_DENOMINATORS = {2, 4, 5, 8, 10}


def rational_to_decimal_string(value):
    """有限小数になる Rational を、誤差のない小数文字列へ変換する。"""
    sign = "-" if value.numerator < 0 else ""
    numerator = abs(value.numerator)
    integer_part, remainder = divmod(numerator, value.denominator)

    if remainder == 0:
        return f"{sign}{integer_part}"

    digits = []
    while remainder != 0:
        remainder *= 10
        digit, remainder = divmod(remainder, value.denominator)
        digits.append(str(digit))

    return f"{sign}{integer_part}." + "".join(digits)


def rational_problem_display(value, decimal_probability=0.5):
    """対象分母なら指定確率で小数、それ以外はLaTeX分数で返す。"""
    if (
        value.denominator in DECIMAL_DENOMINATORS
        and random.random() < decimal_probability
    ):
        return rational_to_decimal_string(value)
    return value.to_mixed_string()


@dataclass(frozen=True)
class OpCandidate:
    operand: Rational
    result: Rational
    # 表示される2数を、そのまま計算したときの約分量
    reduction: int
    raw_num: int
    raw_den: int


@dataclass
class RationalExpression:
    leaf_id: object = None
    value: object = None
    display_value: object = None
    op: object = None
    left: object = None
    right: object = None


OP_SYMBOL = {
    "add": "+",
    "sub": "-",
    "multi": "\\times",
    "div": "\\div",
}

OP_PRECEDENCE = {
    "add": 1,
    "sub": 1,
    "multi": 2,
    "div": 2,
}


def expression_needs_parentheses(child, parent_op, is_right):
    if child.op is None:
        return False

    child_precedence = OP_PRECEDENCE[child.op]
    parent_precedence = OP_PRECEDENCE[parent_op]
    if child_precedence != parent_precedence:
        return child_precedence < parent_precedence

    # 右側へ既存の式を挿入した場合は、同じ優先順位でも括弧を残す。
    # これにより、生成時に検査した途中計算の順序が表示上も維持される。
    return is_right


def render_rational_expression(node, masked_leaf=None):
    if node.op is None:
        if node.leaf_id == masked_leaf:
            return "\\square"
        if node.display_value is not None:
            return node.display_value
        return node.value.to_mixed_string()

    left = render_rational_expression(node.left, masked_leaf)
    right = render_rational_expression(node.right, masked_leaf)

    if expression_needs_parentheses(node.left, node.op, False):
        left = f"\\left( {left} \\right)"
    if expression_needs_parentheses(node.right, node.op, True):
        right = f"\\left( {right} \\right)"

    return f"{left} {OP_SYMBOL[node.op]} {right}"


# 補助関数の使用例（必要な場合のみコメントを外す）
# a = Rational(1, 3)
# pool = cancel_compatible_values(360, 10)
# print(a, pool)


# 足し算・引き算候補の列挙
def add_sub_candidates(
    ans :Rational,
    op,
    side,
    max_num,
    max_den :int,
    max_candidates=40
):
    """
    ans に対して足し算・引き算可能な候補を生成する。

    op:
        "add"
        "sub"

    side:
        "left"  -> a1 OP ans
        "right" -> ans OP a1

    追加する数の既約分母は 2 ～ max_den に限定する。
    max_num は追加する数ではなく、演算後の result のみに適用する。
    """

    a = ans.denominator
    b = ans.numerator

    pool = []

    max_value = as_rational(max_num)
    denominators = list(range(2, max_den + 1))
    random.shuffle(denominators)
    per_den_limit = max(4, max_candidates // len(denominators) + 2)
    seen = set()

    for c in denominators:
        if op == "add":
            # b/a + d/c <= p/q
            remain_num = max_value.numerator * a - b * max_value.denominator
            if remain_num <= 0:
                continue
            d_min = 1
            d_max = (remain_num * c) // (max_value.denominator * a)
        elif op == "sub" and side == "right":
            # b/a - d/c > 0
            d_min = 1
            d_max = (b * c - 1) // a
        elif op == "sub" and side == "left":
            # 0 < d/c - b/a <= p/q
            d_min = (b * c) // a + 1
            total_num = max_value.numerator * a + b * max_value.denominator
            d_max = (total_num * c) // (max_value.denominator * a)
        else:
            raise ValueError(f"invalid op/side: {op}, {side}")

        if d_max < d_min:
            continue

        numerator_candidates = bounded_integer_candidates(
            d_min, d_max, per_den_limit * 3
        )
        for d in numerator_candidates:
            operand = Rational(d, c)
            if operand.denominator == 1:
                continue

            # 表示される既約分数を基準に、約分前の結果を計算する。
            c_display = operand.denominator
            d_display = operand.numerator
            raw_den = a * c_display
            if op == "add":
                raw_num = b * c_display + a * d_display
            elif side == "right":
                raw_num = b * c_display - a * d_display
            else:
                raw_num = a * d_display - b * c_display
            if raw_num <= 0:
                continue

            reduction = gcd(raw_num, raw_den)
            result = Rational(raw_num, raw_den)
            if not valid_result(result, max_value, max_den):
                continue

            key = (
                operand.numerator, operand.denominator,
                result.numerator, result.denominator,
            )
            if key in seen:
                continue
            seen.add(key)
            pool.append(OpCandidate(
                operand, result, reduction, raw_num, raw_den
            ))

            if len(pool) >= max_candidates:
                return pool

    return pool


# 掛け算候補の列挙
def multi_candidates(
    ans,
    max_num,
    max_den,
    max_candidates=20
):
    """
    小さい分子・分母を優先して、ans × operand の候補を返す。
    120以下で有効候補がない場合だけ、大きい成分まで探索する。
    """
    a = ans.denominator
    b = ans.numerator
    max_value = as_rational(max_num)

    # b と約分できる分母、および a と約分できる分子を昇順で用意する。
    denominators_all = cancel_compatible_values(
        b, max_den, min_value=2
    )
    numerators_all = sorted(
        set(range(1, max_den + 1))
        | set(cancel_compatible_values(a, max_den, min_value=1))
    )

    def collect_candidates(denominators, numerators):
        pool = []
        seen = set()

        for c in denominators:
            # ans × d/c <= max_num。operand 自体には上限を設けない。
            d_max = (
                max_value.numerator * a * c
                // (max_value.denominator * b)
            )
            for d in numerators:
                if d > d_max:
                    break

                operand = Rational(d, c)
                if operand.denominator == 1:
                    continue

                raw_num = b * operand.numerator
                raw_den = a * operand.denominator
                reduction = gcd(raw_num, raw_den)
                result = Rational(raw_num, raw_den)
                if not valid_result(result, max_value, max_den):
                    continue

                key = (
                    operand.numerator, operand.denominator,
                    result.numerator, result.denominator,
                )
                if key in seen:
                    continue
                seen.add(key)
                pool.append(OpCandidate(
                    operand, result, reduction, raw_num, raw_den
                ))

        return smallest_op_candidates(pool, max_candidates)

    # 通常は分子・分母がともに120以下の候補だけを使用する。
    small_denominators = small_component_values(denominators_all)
    small_numerators = small_component_values(numerators_all)
    pool = collect_candidates(small_denominators, small_numerators)
    if pool:
        return pool

    # 小さい範囲では計算を作れない場合だけ、大きい値を許可する。
    return collect_candidates(denominators_all, numerators_all)


# 割り算候補の列挙
def div_candidates(
    ans,
    side,
    max_num,
    max_den,
    max_candidates=20
):
    """
    小さい分子・分母を優先して、割り算の候補を返す。
    120以下で有効候補がない場合だけ、大きい成分まで探索する。
    """
    a = ans.denominator
    b = ans.numerator
    max_value = as_rational(max_num)

    # c と a、d と b の約分を利用する。値は小さい順で保持する。
    denominators_all = cancel_compatible_values(
        a, max_den, min_value=2
    )
    numerators_all = cancel_compatible_values(
        b, max_den, min_value=1
    )

    def collect_candidates(denominators, numerators):
        pool = []
        seen = set()

        for c in denominators:
            for d in numerators:
                operand = Rational(d, c)
                if operand.denominator == 1:
                    continue

                if side == "right":
                    # b/a ÷ d/c = bc/ad
                    raw_num = b * operand.denominator
                    raw_den = a * operand.numerator
                elif side == "left":
                    # d/c ÷ b/a = ad/bc
                    raw_num = a * operand.numerator
                    raw_den = b * operand.denominator
                else:
                    raise ValueError(f"invalid side: {side}")

                reduction = gcd(raw_num, raw_den)
                result = Rational(raw_num, raw_den)
                if not valid_result(result, max_value, max_den):
                    continue

                key = (
                    operand.numerator, operand.denominator,
                    result.numerator, result.denominator,
                )
                if key in seen:
                    continue
                seen.add(key)
                pool.append(OpCandidate(
                    operand, result, reduction, raw_num, raw_den
                ))

        return smallest_op_candidates(pool, max_candidates)

    # 通常は分子・分母がともに120以下の候補だけを使用する。
    small_denominators = small_component_values(denominators_all)
    small_numerators = small_component_values(numerators_all)
    pool = collect_candidates(small_denominators, small_numerators)
    if pool:
        return pool

    # 小さい範囲では計算を作れない場合だけ、大きい値を許可する。
    return collect_candidates(denominators_all, numerators_all)


# 有理数の四則演算問題を作成する。
def rational_candidate_weight(candidate, op, max_den):
    """候補内の約分と数の大きさから、候補を選ぶ重みを返す。"""
    if op in ("multi", "div"):
        if candidate.reduction > 1:
            return 1.0 + min(6.0, 1.5 * math.sqrt(candidate.reduction))
        return 0.55

    # 加減算は、小さい数なら約分の有無で重みを変えない。
    size = max(abs(candidate.raw_num), candidate.raw_den)
    small_limit = max(12, max_den * 2)
    if size <= small_limit:
        return 1.0

    # 大きい数では、約分できる候補を優先し、
    # 約分できない複雑な候補は低確率にする。
    if candidate.reduction > 1:
        return 1.0 + min(4.0, math.sqrt(candidate.reduction))
    return 0.35


def rational_operation_weight(op, candidates):
    """加減算を残しつつ、約分できる乗除算を優先する。"""
    if op in ("add", "sub"):
        return 1.0
    if any(candidate.reduction > 1 for candidate in candidates):
        return 1.0
    return 0.55


def rational_initial_operand(max_num, max_den):
    """分母1を避けた、問題式の最初の数を作る。"""
    max_value = as_rational(max_num)
    pool = []

    for denominator in range(2, max_den + 1):
        numerator_max = max(1, floor_rational_times(max_value, denominator))
        numerators = bounded_integer_candidates(
            1, numerator_max, max(8, max_den * 2)
        )
        for numerator in numerators:
            value = Rational(numerator, denominator)
            if value.denominator != 1:
                pool.append(value)

    if not pool:
        # max_num が非常に小さい場合も、最初の数には上限を課さない。
        # 最初の演算結果から max_num の制限を適用する。
        pool = [Rational(1, denominator) for denominator in range(2, max_den + 1)]

    return random.choice(pool)


def rational_candidate_pool(ans, op, side, max_num, max_den):
    if op in ("add", "sub"):
        return add_sub_candidates(ans, op, side, max_num, max_den)
    if op == "multi":
        return multi_candidates(ans, max_num, max_den)
    if op == "div":
        return div_candidates(ans, side, max_num, max_den)
    raise ValueError(f"invalid operation: {op}")


def make_one_rational_problem(
    term_num, max_denominator, max_num, problem_type
):
    """1問を構築する。候補が尽きた場合は None を返す。"""
    ans = rational_initial_operand(max_num, max_denominator)
    initial_display = rational_problem_display(ans)
    expression = RationalExpression(
        leaf_id=0, value=ans, display_value=initial_display
    )
    leaf_values = {0: ans}
    operations = ("add", "sub", "multi", "div")
    sides = ("left", "right")

    for leaf_id in range(1, term_num):
        choices = []
        choice_weights = []

        for side in sides:
            for op in operations:
                candidates = rational_candidate_pool(
                    ans, op, side, max_num, max_denominator
                )
                if not candidates:
                    continue
                choices.append((side, op, candidates))
                choice_weights.append(
                    rational_operation_weight(op, candidates)
                )

        if not choices:
            return None

        side, op, candidates = random.choices(
            choices, weights=choice_weights, k=1
        )[0]
        weights = [
            rational_candidate_weight(candidate, op, max_denominator)
            for candidate in candidates
        ]
        selected = random.choices(candidates, weights=weights, k=1)[0]

        operand_display = rational_problem_display(selected.operand)
        operand_node = RationalExpression(
            leaf_id=leaf_id,
            value=selected.operand,
            display_value=operand_display,
        )
        leaf_values[leaf_id] = selected.operand
        if side == "left":
            expression = RationalExpression(
                op=op, left=operand_node, right=expression
            )
        else:
            expression = RationalExpression(
                op=op, left=expression, right=operand_node
            )
        ans = selected.result

    result_display = rational_problem_display(ans)

    if problem_type == 1:
        # 計算のみ：右辺の計算結果を隠す。
        masked = "result"
    elif problem_type == 2:
        # 逆算のみ：式中の数を一つ隠す。
        masked = random.randrange(term_num)
    else:
        # 計算＋逆算：式中の数または右辺からランダムに選ぶ。
        masked = random.choice([*range(term_num), "result"])

    if masked == "result":
        formula = f"{render_rational_expression(expression)} = \\square"
        answer = ans.to_mixed_string()
    else:
        formula = (
            f"{render_rational_expression(expression, masked_leaf=masked)} "
            f"= {result_display}"
        )
        answer = leaf_values[masked].to_mixed_string()

    return [formula, answer]


def make_problems_rational(
    term_num: int,
    max_denominator: int,
    max_num,
    problem_num: int,
    type=0,
):
    """
    正の有理数だけを使った四則演算問題を生成する。

    term_num:
        問題式に登場する数の個数（2以上）。
    max_denominator:
        加減算で追加する数の分母上限。計算結果の既約分母は
        LCM(1, ..., max_denominator) の約数に限定する。
    max_num:
        各演算結果の上限。追加する数そのものには適用しない。
        int または Rational を指定できる。
    problem_num:
        生成する問題数。
    type:
        問題設定。1: 計算のみ、2: 逆算のみ、0: 計算＋逆算。

    戻り値:
        [[LaTeX形式の問題文字列, LaTeX形式の答え文字列], ...]
        問題中の数は小数表示になる場合があるが、答えは常に分数表示にする。
    """
    if not isinstance(term_num, int) or term_num < 2:
        raise ValueError("term_num must be an integer greater than or equal to 2")
    if not isinstance(max_denominator, int) or max_denominator < 2:
        raise ValueError("max_denominator must be an integer greater than or equal to 2")
    if not isinstance(problem_num, int) or problem_num < 0:
        raise ValueError("problem_num must be a non-negative integer")
    if type not in (0, 1, 2):
        raise ValueError("type must be 0, 1, or 2")

    max_value = as_rational(max_num)
    if max_value.numerator <= 0:
        raise ValueError("max_num must be positive")

    problems = []
    attempts = 0
    max_attempts = max(100, problem_num * 50)

    while len(problems) < problem_num and attempts < max_attempts:
        attempts += 1
        problem = make_one_rational_problem(
            term_num, max_denominator, max_value, type
        )
        if problem is not None:
            problems.append(problem)

    if len(problems) != problem_num:
        raise RuntimeError(
            f"could not generate enough problems: "
            f"{len(problems)}/{problem_num}"
        )

    return problems


if __name__ == "__main__":
    # 直接実行した場合だけ問題を生成し、CSVに保存する。
    problems = make_problems_rational(
        term_num=4,
        max_denominator=6,
        max_num=2,
        problem_num=1000,
        type=2,
    )
    export_questions_to_csv(problems, Path(__file__).with_name("rational_problems.csv"))
