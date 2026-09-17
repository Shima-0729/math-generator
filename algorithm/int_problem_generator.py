import random
import csv
import math
from pathlib import Path

# 約数を計算
def divisors(n):
    result = []
    if n < 4:
        return result

    for i in range(2, n):
        if n % i == 0:
            result.append(i)

    return result


# mask用関数
def random_one_index(arr):
    # 1 の要素の index を取得
    one_indices = [i for i, x in enumerate(arr) if x == 1]

    # 1 が存在しない場合
    if not one_indices:
        return None

    # ランダムに1つ選択
    return random.choice(one_indices)

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

# 指数分布
def random_int_adjust(a :int, b:int, strength = 1.5):
    r = random.random() ** strength
    return int(a + (b - a) * r)


# 任意の四則演算問題を作成する。
def make_problems(term_num :int, max_int :int, problem_num :int, type = 0):
    """
        (int) term_int  : 項数
        (int) max_int   : 問題作成時、計算上の最大の数
        (int) proble_num: 問題数
        (int) type      : 問題設定 1: 計算のみ 2: 逆算のみ 0: 計算+逆算
    """
    problem_ans_list = []
    LRs = ["left","right"]
    ops = ["add","sub","multi","div"]
    lastmask_val = 1

    if(type == 2): lastmask_val = 0
    if(type >= 3): raise ValueError("invaid type value!")

    for _ in range(0,problem_num):
        # tempファイル
        old_op = "None"
        ans = max_int // 8
        formula = ""
        s_list = []
        mask = []

        i = 0
        while i < term_num :
            # 演算子を選択
            sed_LR = LRs[random.randint(0,1)]

            # 運が悪くmax_intを超えてしまった場合は引き算を選択
            if(ans >= max_int):
                sed_LR = "right"
            elif(ans <= 1):
                sed_LR = "right"

            if(i == 0): sed_LR = "left"

            match sed_LR:
                case "left":
                    if(2 * ans >= max_int): #掛け算桁あふれ防止
                        if(ans > max_int // 4 * 3):
                            sed_op = "sub"
                        else:
                            sed_op = "add"
                    else:
                        sed_op = ops[random.randint(0,3)]

                    match sed_op:
                        case "add":
                            # 初回時
                            if(i == 0):
                                ans = random_int_adjust(max_int // 10, max_int // 4)
                                s_list.append(str(ans));mask.append(1)
                                i += 1

                            # 左側にプラスを挿入
                            s_list.insert(0,"+");mask.insert(0,0)
                            a1 = random_int_adjust(1,max_int-ans+1)
                            s_list.insert(0,str(a1));mask.insert(0,1)
                            i += 1

                            # 解答更新
                            ans = a1 + ans

                        case "sub" :
                            # 初回時
                            if(i == 0):
                                ans = random_int_adjust(max_int // 10, max_int // 4)
                                s_list.append(str(ans));mask.append(1)
                                i += 1


                            # 前が足し算引き算の時、かっこを挿入
                            if ((old_op == "add") or (old_op == "sub")) :
                                s_list.insert(0,"(");mask.insert(0,0)
                                s_list.append(")");mask.append(0)
                            s_list.insert(0,"-");mask.insert(0,0)

                            # 左側にマイナスを挿入
                            a1 = random_int_adjust(ans+1,max_int)
                            s_list.insert(0,str(a1));mask.insert(0,1)
                            i += 1

                            # 解答を計算
                            ans = a1 - ans

                        case "multi" :
                            # 初回時
                            if(i == 0):
                                ans = random_int_adjust(2,(int(math.sqrt(max_int))) // 2)
                                s_list.append(str(ans));mask.append(1)
                                i += 1

                            # 前が足し算引き算割り算の時、かっこを挿入
                            if ((old_op == "add") or (old_op == "sub") or (old_op == "div")) :
                                s_list.insert(0,"(");mask.insert(0,0)
                                s_list.append(")");mask.append(0)
                            s_list.insert(0,"×");mask.insert(0,0)

                            # 左側に掛け算を挿入
                            a1 = random_int_adjust(2, max_int // ans, 1.0)
                            s_list.insert(0,str(a1));mask.insert(0,1)
                            i += 1

                            # 解答を計算
                            ans = a1 * ans

                        case "div":
                            # 初回時
                            if(i == 0):
                                ans = random_int_adjust(2,(int(math.sqrt(max_int))) // 2)
                                s_list.append(str(ans));mask.append(1)
                                i += 1

                            # 前が足し算引き算掛け算割り算の時、かっこを挿入
                            if ((old_op == "add") or (old_op == "sub") or (old_op == "multi") or (old_op == "div")) :
                                s_list.insert(0,"(");mask.insert(0,0)
                                s_list.append(")");mask.append(0)
                            s_list.insert(0,"÷");mask.insert(0,0)

                            # 左側に割り算を挿入
                            a1_temp = random_int_adjust(2, max_int // ans)
                            a1 = ans * a1_temp
                            s_list.insert(0,str(a1));mask.insert(0,1)
                            i += 1

                            # 解答を計算
                            ans = a1 // ans

                case "right":
                    if((2 * ans >= max_int) and ((len(divisors(ans))) == 0)): #掛け算桁あふれもしくは割り算する対象が素数の時
                        if(ans > max_int // 4 * 3):
                            sed_op = "sub"
                        else:
                            sed_op = "add"
                    elif(2 * ans >= max_int): #桁あふれの時は割り算も可能
                        op_temp = random.randint(0,2)
                        if op_temp == 2: op_temp += 1
                        sed_op = ops[op_temp]
                    elif ((len(divisors(ans)) == 0) and (i != 0)): #割り算する相手が素数の場合
                        sed_op = ops[random.randint(0,2)] #足し算引き算掛け算のみ
                    else:
                        sed_op = ops[random.randint(0,3)]

                    # 運が悪くmax_intを超えてしまった場合は引き算を選択
                    if(ans >= max_int):
                        sed_op = "sub"
                    elif(ans <= 1):# 運が悪く負の数が出現した際は足し算を選択
                        sed_op = "add"

                    match sed_op:
                        case "add":

                            # 右側にプラスを挿入
                            s_list.append("+");mask.append(0)
                            a1 = random_int_adjust(1,max_int-ans+1)
                            s_list.append(str(a1));mask.append(1)
                            i += 1

                            # 解答更新
                            ans = a1 + ans

                        case "sub" :
                            s_list.append("-");mask.append(0)

                            # 右側にマイナスを挿入
                            a1 = random_int_adjust(1,ans-1, 0.4)
                            s_list.append(str(a1));mask.append(1)
                            i += 1

                            # 解答を計算
                            ans = ans - a1

                        case "multi" :

                            # 前が足し算引き算の時、かっこを挿入
                            if ((old_op == "add") or (old_op == "sub")) :
                                s_list.insert(0,"(");mask.insert(0,0)
                                s_list.append(")");mask.append(0)
                            s_list.append("×");mask.append(0)

                            # 右側に掛け算を挿入
                            a1 = random_int_adjust(2, max_int // ans, 1.0)
                            s_list.append(str(a1));mask.append(1)
                            i += 1

                            # 解答を計算
                            ans = ans * a1

                        case "div" :

                            # 前が足し算引き算の時、かっこを挿入
                            if ((old_op == "add") or (old_op == "sub")) :
                                s_list.insert(0,"(");mask.insert(0,0)
                                s_list.append(")");mask.append(0)
                            s_list.append("÷");mask.append(0)

                            # 右側に割り算を挿入
                            ansdivs = divisors(ans)
                            a1 = (ansdivs)[random.randint(0,len(ansdivs)-1)]
                            s_list.append(str(a1));mask.append(1)
                            i += 1

                            # 解答を計算
                            ans = ans // a1

            # 前の演算子を保存
            old_op = sed_op

        # 最後に式の解答を挿入
        s_list.append("=")
        mask.append(0)
        s_list.append(str(ans))
        mask.append(lastmask_val)

        # 項を一つマスクする。マスクした解答を保存
        mask_index = random_one_index(mask)
        if type == 1 : mask_index = len(mask) - 1 
        mask_ans = s_list[mask_index]
        s_list[mask_index] = "□"
        formula = (" ".join(s_list))

        # 問題を追加
        problem_ans_list.append([formula,mask_ans])

    return problem_ans_list


if __name__ == "__main__":
    # 直接実行した場合だけ問題を生成し、CSVに保存する。
    problems = make_problems(
        term_num=3,
        max_int=1000,
        problem_num=1000,
        type=0,
    )
    export_questions_to_csv(problems, Path(__file__).with_name("integer_problems.csv"))
