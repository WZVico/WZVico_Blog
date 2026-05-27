---
title: Transformer 内部探秘：一个 token 的一生
description: 深入解析现代稠密 Transformer：YaRN、混合注意力、软截断、QK 归一化、FLOPs/token、集群规模配置等。
date: 2026-05-27
slug: inside-the-transformer-the-life-of-a-token
badge: 译文
tags:
  - 大模型底层原理
  - Transformer
  - 注意力机制
  - 位置编码
draft: false
archive: true
translation:
  translator: gemini-3.1-pro-preview
  avatar: author/Gemini.png
  source: "Inside the Transformer: The Life of a Token"
  sourceUrl: https://www.aleksagordic.com/blog/transformer
author:
  name: Aleksa Gordić
  avatar: author/Aleksa Gordić.webp
---

本文将带大家深入剖析现代稠密 Transformer 的内部机制 [^1]。我们将完全聚焦单 GPU 上的前向传播过程，就如同刚要迈出训练的第一步，暂且撇开反向传播和分布式系统的诸多细节（实际上，无论训练还是推理，大型 Transformer 都会跨多台设备进行分片）。

为了方便贯穿全篇进行说明，我将直接拿 [Rnj 1.5](https://huggingface.co/EssentialAI/rnj-1.5-instruct) 的架构作为示例。这是我在 Ashish Vaswani 的人工智能实验室（Essential AI Labs）与团队共同研发的模型。

:::info[Rnj-1.5 幕后团队：]
Rnj 1.5 的诞生离不开以下这群杰出的伙伴（按字母顺序排列）：

**代码组 (Code pod):** Adarsh Chaluvaraju, Devaansh Gupta, Yash Jain, Somanshu Singla, Saurabh Srivastava (技术负责人), Anil Thomas

**STEM 组 (STEM pod):** Aleksa Gordić (技术负责人), Michael Pust, Tim Romanski, Ali Shehper, Kurt Smith (技术负责人), Ameya Velingker

**基建组 (Infra pod):** Mike Callahan, Philip Monk (技术负责人), Khoi Nguyen (技术负责人), Alok Tripathy, Yash Vanjani

**组织管理 (Org):** Divya Mansingka, Mohit Parmar, Peter Rushton

**研发路线图 (Research and Engineering Roadmap):** Ashish Vaswani
:::

本周我们已正式发布该模型，并在 [Hugging Face](https://huggingface.co/EssentialAI/rnj-1.5-instruct) 上开源了权重。

作为 Rnj 1.0 [^2] 的长上下文升级版，它将上下文窗口从 32k 飙升至 160k，并在 128k 上下文窗口的 RULER 基准测试中斩获 79% 的高分。此次发布还在更广泛的测试框架中展现出更强悍的编程能力。详情请参阅我们的[模型卡片](https://huggingface.co/EssentialAI/rnj-1.5-instruct)。

本文结构分为七个部分：
1. [Transformer 前向传播](#transformer-mpo41beq-ygrf1)：token 运转的高层视角
2. [RMSNorm](#rmsnorm-mpo42q2o-b5dn2)：归一化层
3. [GeGLU MLP](https://www.aleksagordic.com/blog/transformer#cpt3)：GELU 门控前馈模块
4. [MHA](https://www.aleksagordic.com/blog/transformer#cpt4)：多头自注意力机制
5. [YaRN](https://www.aleksagordic.com/blog/transformer#cpt5)：处理长上下文的位置嵌入
6. [核心注意力](https://www.aleksagordic.com/blog/transformer#cpt6)：全局 + 局部块
7. [Transformer 数学原理](https://www.aleksagordic.com/blog/transformer#cpt7)：FLOPs/token、集群规模配置等

在后续文章中，我还将深挖条件计算（conditional computation），重点探讨稀疏 Transformer（即混合专家模型，MoE）。
<span id="transformer-mpo41beq-ygrf1" class="page-anchor"></span>
## Transformer 前向传播

举个例子，假设我们从数据集中抽取 2 篇“文档”，参数如下：

- 批大小 (batch size) = 1
- 序列长度 (sequence length) = 16
- 启用文档打包 (document packing)

我们将追踪一个 token 在 Transformer 中的流转轨迹，并顺藤摸瓜，逐一拆解各个组件。

现在开始。请先仔细端详下图：

![图 1：分词阶段](https://www.aleksagordic.com/blog/transformer/flow_pre.png)

图 1：分词阶段

我们先将文档进行分词，化作一串整数序列，再将两篇文档拼装成一个单一序列。

:::tip[]
在本文的讨论范围内，不妨将分词器（tokenizer）视作一个黑盒组件。它吞入文本，吐出一串 token 序列，每个 token 都由一个整数 ID 代表。实操中，分词器多采用 BPE 等算法在独立的语料库上“训练”而成，靠不断合并高频字符或字节序列来学习词表。出色的分词器设计往往具备几项优良特性，比方说，将数字单独拆分成独立的 token 就极大地助力了数值推理。
:::

与这些 token 并行的，我们还构建了两个辅助结构：

- 输入位置 (inputs positions)：供位置嵌入模块 (YaRN) 使用
- 分割掩码 (segmentation mask)：供注意力机制掩盖特定信息使用

以上便是预处理阶段。

:::note[补充说明：]
出于效率考量，正式训练打响前，数据就已提前切块完毕。数据加载器（data loader）将这些预处理好的结构直接喂进训练循环。到了这一步，我们再也不用和原始字符串打交道了。（Spark）数据流水线和数据加载器里面的门道，完全够再写好几篇长文了。
:::

接下来，我们利用输入 token 去查找嵌入表（embedding table）。

大可把嵌入表看作是大语言模型（LLM）的专属词汇表。

这一索引操作将我们的整数序列转化为了 16 个维度为 4096 的 `bf16` 向量序列：

![图 2：嵌入阶段](https://www.aleksagordic.com/blog/transformer/flow_pro.png)

图 2：嵌入阶段

:::note[补充说明：]
特殊 token 并非分词过程的自然产物——没有任何文本会映射到大于等于 128,000 的 token ID。它们是在训练时被人为注入的（并在后续推理中派上用场），目的是拔高模型性能（例如 FIM、代码库打包等），或是强制模型执行特定行为（例如生成结束、轮次结束、工具调用等）。

我们来深挖一下 FIM [[1\]](#fn-1)（Fill-In-the-Middle，中间填充）这类特殊 token。

在（预）训练阶段，我们拿来一篇文档，将其拆解为前缀、中间（中缀）和后缀三部分，然后拼装成这样的序列：`<FIM_PRE>` 前缀 `<FIM_SUF>` 后缀 `<FIM_MID>` 中间内容。模型就此接受训练，学会在已知前缀和后缀的情况下预测中间缺失的内容。到了推理时，这项本领便能大显身手。

打个比方，假设你在最称手的 IDE 里用 Rnj 1.5 玩代码自动补全。光标往那儿一闪，自然就把代码劈成了前缀和后缀，中间留白。只要插入 FIM token 并以 `<FIM_MID>` 收尾，模型心领神会，立刻填补空白。这些 token 就是向模型传达意图的绝佳信使。

分词器的学问浩如烟海，单独开篇绰绰有余，这里就点到即止了。
:::

万事俱备，准备杀入第一个 Transformer 层。

须知道，所有 Transformer 层的结构（几乎）如出一辙，因此我只挑一个细讲。实战中，数据要连闯 32 层关卡——不妨把它当成一个 for 循环，只不过在 Rnj 1.5 里，每一层都揣着自己独立的可学习权重。

:::tip[]
说“几乎”，是因为 Rnj-1.5 混搭了局部块注意力层和全局注意力层——唯一的区别藏在掩码里。但在更高维度的抽象层面上，前面那句话依旧站得住脚。这部分玄机，咱们留到注意力环节细说。

还要提一嘴，有些 Transformer 实现在层与层之间玩起了权重共享或部分共享（花样繁多），但咱们这儿只关注 Rnj 1.5。
:::

来，走一遍 Transformer 块的前向传播。请细品下图：

![图 3：Transformer 块的前向传播](https://www.aleksagordic.com/blog/transformer/flow_main.png)

图 3：Transformer 块的前向传播

宏观来看，这个块由四个 RMSNorm 子模块、一个 MLP（多层感知机）、一个注意力模块、两条残差连接以及两次求和运算拼凑而成。残差连接充当了搬运工，把块内早期阶段的向量拷贝直接运到后头。

划重点：除注意力模块外，所有子模块都是针对单个向量各自为战的。

:::tip[背景知识补充：]
实践中，Transformer 块的变体数不胜数。设计上的分岔路口包括：归一化层的位置、种类与数量；MLP 的具体构造（带不带门控、门控函数怎么选等）；残差连接的形态（恒等映射、注意力残差 [[2\]](#fn-2) 等）；当然，最要紧的还是注意力模块。

宽泛地讲，注意力机制按序列长度计算，要么是二次复杂度（如 MLA [[3\]](#fn-3)、缩放点积注意力等），要么是线性复杂度（如 Kimi Linear [[4\]](#fn-4)）。它们在建模功力（尤其是死磕长上下文时）与运行效率之间各有取舍，暗自博弈。
:::

向量一旦闯过最后一个 Transformer 块，便会被一场矩阵乘法投射到 128,256 维的广阔空间中。这便孕育出了 `logits`，紧接着经由 softmax 蜕变为概率分布。推理时，我们从中抽样；训练时，它则化身交叉熵损失的一部分。

![图 4：](https://www.aleksagordic.com/blog/transformer/flow_epi.png)

图 4：

接下来，咱们扎进各个子层探个究竟。这次换个花样，倒序推进，顺理成章地由浅入深：

1. RMSNorm（均方根层归一化）
2. GeGLU MLP（多层感知机）
3. 注意力（缩放点积注意力）
<span id="rmsnorm-mpo42q2o-b5dn2" class="page-anchor"></span>
## RMSNorm（均方根层归一化）

RMSNorm [[5\]](#fn-5) 是一项归一化绝技，专为稳住深度神经网络的训练阵脚而生。

前头提过，RMSNorm 针对单个向量发力，因此我们将目光锁定在单条 4096 维的 `bf16` 向量上（其余向量全凭并行计算依葫芦画瓢）。出炉的结果在形状和数据类型上均保持原样：

![图 5：RMSNorm](https://www.aleksagordic.com/blog/transformer/RMSNorm.png)

图 5：RMSNorm

## GeGLU MLP（多层感知机）

MLP 是一张简单、逐点运算的前馈神经网络，专门负责摸清输入与输出向量间那些错综复杂的非线性关系。

我们采用的变体叫 GeGLU（GELU 门控线性单元 [[6\]](#fn-6)）。它的门控机制拉来了 GELU 坐镇，公式长这样：`W2 @ GELU(W0@X)*(W1@X)`：

![图 6：GeGLU MLP](https://www.aleksagordic.com/blog/transformer/MLP.png)

图 6：GeGLU MLP

若用 ReLU，“门控”一词可谓名副其实。因为门控向量非负，只能用来压制或按比例缩放特征。但换成 GELU，门控值存在负数，这就使得“门”还能翻转特征的符号。这么一来，“门控”反倒成了一个略显松散的历史遗留称谓。

## MHA（多头注意力机制）

MHA是一种自注意力机制，用来对序列中不同token间的关系进行建模。本文使用的是MHA的一个特殊变体——GQA，即分组查询注意力（Group Query Attention）。相比于Q头（查询头），GQA减少了K/V头（键/值头）的数量，因此多个查询（组成一组）会共享同一个键。

首先，我来做个宏观概述；接着，咱们再深入探究两个最核心的组件：YaRN和核心注意力机制（Core Attention）。

第一步，我们将每个向量独立映射为查询（query）、键（key）和值（value）向量。接着改变它们的形状（reshape），对查询和键进行归一化处理，并引入YaRN（通过旋转注入位置信息）。随后是核心注意力环节，负责将各个位置的信息进行融合。最后，通过线性投影生成最终输出。

![图7：MHA - 多头注意力](https://www.aleksagordic.com/blog/transformer/MHA.png)

图7：MHA - 多头注意力

现在，我们把目光转向YaRN（Yet another RoPE extensioN，另一种RoPE扩展）。

## YaRN

YaRN [[7\]](#fn-7) 巧妙地对RoPE [[8\]](#fn-8)（旋转位置编码）做了改良，使其在处理更长上下文时具备更好的外推能力。

但话又说回来，我们最初为什么需要位置编码呢？

![图8：为什么需要位置编码](https://www.aleksagordic.com/blog/transformer/yarn_intro.png)

图8：为什么需要位置编码

搞清楚了原因，咱们来看看RoPE是如何工作的：

![图9：YaRN频率表](https://www.aleksagordic.com/blog/transformer/yarn2.png)

图9：YaRN频率表

下面这张可视化图展示了不同YaRN频率的表现。请注意，图中最低的频率每跨越108.8万个位置才完成1个周期！

![图10：YaRN频率](https://www.aleksagordic.com/blog/transformer/yarn3.png)

图10：YaRN频率

有了这些基础，咱们就可以看看位置编码在正向传播过程中是如何注入的了：

![图11：YaRN - 正向传播](https://www.aleksagordic.com/blog/transformer/yarn4.png)

图11：YaRN - 正向传播

YaRN的正向传播过程到此告一段落。

了解了运作机制后，你可能还有个疑问：YaRN究竟是如何先对查询和键向量进行成对的坐标旋转，再通过点积运算来编码相对位置信息的？

![图12：RoPE如何编码相对位置信息？](https://www.aleksagordic.com/blog/transformer/yarn5.png)

图12：RoPE如何编码相对位置信息？

以上就是关于RoPE/YaRN的全部奥秘！:)

## 核心注意力（Core Attention）

最后，咱们来剖析核心注意力机制。在实际应用中，大家都在用FlashAttention，这值得单独写篇博客聊聊（其实早在23年我就写过一篇，[不妨去看看](https://gordicaleksa.medium.com/eli5-flash-attention-5c44017022ad) [[9\]](#fn-9)）。在此，我主要梳理一下原汁原味的传统注意力机制（Vanilla Attention）。

核心注意力机制负责对序列中各token之间的关系进行建模。花点时间拆解一下这个过程：

![图13：计算注意力分数的(seqlen, seqlen)矩阵](https://www.aleksagordic.com/blog/transformer/attn1.png)

图13：计算注意力分数的(seqlen, seqlen)矩阵

要是到此为止，就会出现以下情况：

1. 文档1的token可能会关注到文档2的token（反之亦然）。
2. token `i` 可能会关注到 token `i+1`（也就是未来的token），这打破了因果律（causality）。

为了防止这种越界，必须引入掩码（Masking）机制！

![图14：注意力掩码与值向量聚合](https://www.aleksagordic.com/blog/transformer/attn2.png)

图14：注意力掩码与值向量聚合

现在，试想序列长度从16暴增到了32,768。为简便起见，假设只有一篇没有进行任何填充（padding）的单文档。此时的掩码会长什么样？

![图15：混合注意力：局部块 + 全局](https://www.aleksagordic.com/blog/transformer/attn3.png)

图15：混合注意力：局部块 + 全局

换个角度来直观看看这种布局，我们将视线聚焦在位置9,000和10,000的token上：

![图16：混合注意力布局](https://www.aleksagordic.com/blog/transformer/attn4.png)

图16：混合注意力布局

不难发现，在多数层（局部块，block-local）中，这两个token的注意力无法越过4,096这个范围。而在剩下的8个全局层（global）中，它们的注意力可以一路回溯到位置0。

## Transformer 数学推算

最后，我想简要聊聊KV缓存（KV cache）。理解推理过程，这是一个极其核心的概念。在这之前，咱们看的都是训练阶段的正向传播。

推理时，Transformer是自回归的——每次只生成一个token。如果每前进一步都要把之前所有token的键和值重新计算一遍，效率必然低得令人发指。万幸的是完全没这必要：在因果Transformer中，它们是不变的。我们只需计算一次，然后将其统统存入缓存。

咱们来盘一盘KV缓存的基本存储需求：

![图17：KV缓存计算](https://www.aleksagordic.com/blog/transformer/calc1.png)

图17：KV缓存计算

接着，顺手算算 Rnj 1.5 模型包含多少个可学习参数。只需顺着架构理一遍，把所有可学习的权重加起来就行。

![图18：可学习参数数量计算](https://www.aleksagordic.com/blog/transformer/calc2.png)

图18：可学习参数数量计算

**为了方便心算**，你只需留意MLP里的3个矩阵和注意力机制里的4个矩阵，其余的全当不存在即可。

现在，再来算算每个token需要消耗多少算力（FLOPs）。这对规划集群规模极具指导价值——咱们在下一节细说。

![图19：单token算力计算](https://www.aleksagordic.com/blog/transformer/calc3.png)

图19：单token算力（FLOPs）计算

这个 `6N` 公式值得牢记。同时也要记住它成立的前提条件（即序列长度远小于模型内部维度，`seqlen << inner model dimension`）。

最后，来看看如何利用上述公式来规划集群规模：

![图20：集群规模规划计算](https://www.aleksagordic.com/blog/transformer/calc4.png)

图20：集群规模规划计算

搞定这些，你就可以理直气壮地找孙正义（Masayoshi Son）要个10亿美元的天使轮融资了。

![图21：实现盈利（Profit）](https://www.aleksagordic.com/blog/transformer/sp.png)

图21：实现盈利（Profit）

## 尾声

我们见证了单个token是如何在Transformer中流转的，也理清了各个子组件之间如何协同运作。

我们深入探讨了YaRN和注意力机制，并推导了Transformer中最核心的几个数学公式。

在接下来的文章里，我会继续深挖MoE、Muon（优化器 [[10\]](#fn-10)），以及几项架构创新，如MLA（DeepSeek）、MTP（多token预测）和DSA（稀疏注意力 [[11\]](#fn-11)）。

---

## 参考文献

1. 《注意力机制是你所需的一切》，https://arxiv.org/abs/1706.03762
2. RNJ 1.0，https://essential.ai/research/rnj-1
3. 《高效训练语言模型实现中间填充》，https://arxiv.org/abs/2207.14255
4. 《注意力残差学习》，https://arxiv.org/abs/2603.15031
5. 《DeepSeek-V2：强大、经济且高效的混合专家语言模型》，https://arxiv.org/abs/2405.04434
6. 《Kimi Linear：表现力强且高效的注意力架构》，https://arxiv.org/abs/2510.26692
7. 《均方根层归一化》，https://arxiv.org/abs/1910.07467
8. 《GLU变体提升Transformer性能》，https://arxiv.org/abs/2002.05202
9. 《YaRN：大语言模型上下文窗口的高效扩展》，https://arxiv.org/abs/2309.00071
10. 《RoFormer：融合旋转位置嵌入的增强版Transformer》，https://arxiv.org/abs/2104.09864
11. 《深入浅出Flash Attention》，https://gordicaleksa.medium.com/eli5-flash-attention-5c44017022ad
12. Muon，https://kellerjordan.github.io/posts/muon/
13. 《剖析大语言模型中的稀疏性：内在的数据感知稀疏注意力》，https://arxiv.org/abs/2512.02556
